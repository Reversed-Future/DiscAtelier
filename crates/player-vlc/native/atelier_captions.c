/* DiscAtelier subtitle and audio tap for the bundled VLC 3 ABI. */
#define MODULE_STRING "atelier_captions"
#define __PLUGIN__ 1
#include <winsock2.h>
static inline int poll(struct pollfd *fds,unsigned n,int timeout) { return WSAPoll(fds,n,timeout); }
#include <windows.h>
#include <vlc_common.h>
#include <vlc_plugin.h>
#include <vlc_filter.h>
#include <vlc_subpicture.h>
#include <vlc_text_style.h>
#include <vlc_aout.h>
#include <vlc_block.h>

enum { STYLED = 1, LISTEN = 2, MAX_PIXELS = 4096*1080, SAMPLES = 16000*5 };
static SRWLOCK lock = SRWLOCK_INIT;
static int session, mode, width, height, audio_count, write_pos;
static LONG cue_sequence, current_cue, version;
static ULONGLONG seen;
static unsigned char pixels[MAX_PIXELS];
static char words[16384];
static int16_t samples[SAMPLES];

__declspec(dllexport) void atelier_mode(int id, int next) {
    AcquireSRWLockExclusive(&lock);
    session=id; mode=next; current_cue=0; seen=0; audio_count=write_pos=0; ++version;
    width=height=0; words[0]=0;
    ReleaseSRWLockExclusive(&lock);
}
/* Poll just the header until a new subtitle arrives. */
__declspec(dllexport) int atelier_read(int id,int previous,int paused,int *w,int *h,unsigned char *dst,int cap,char *text,int text_cap) {
    AcquireSRWLockShared(&lock);
    int result=0;
    if (session==id && mode==STYLED && seen && (paused || GetTickCount64()-seen<550)) {
        result=version;
        if (result!=previous) {
            *w=width; *h=height;
            if (cap>=width*height && dst) memcpy(dst,pixels,width*height);
            if (text && text_cap>0) snprintf(text,text_cap,"%s",words);
        }
    }
    ReleaseSRWLockShared(&lock);
    return result;
}
__declspec(dllexport) int atelier_pcm(int id,int16_t *out,int needed) {
    int n=0;
    AcquireSRWLockExclusive(&lock);
    if(session==id && mode==LISTEN && needed>0 && needed<=SAMPLES && audio_count>=needed) {
        int pos=(write_pos+SAMPLES-audio_count)%SAMPLES;
        for(n=0;n<needed;n++) out[n]=samples[(pos+n)%SAMPLES];
        audio_count-=n;
    }
    ReleaseSRWLockExclusive(&lock);
    return n;
}

typedef struct { subpicture_updater_t orig; LONG cue; int id,alpha; } wrapper;
static void collect(subpicture_t *s,wrapper *state) {
    AcquireSRWLockExclusive(&lock);
    s->i_alpha=state->alpha;
    if(session!=state->id || mode!=STYLED || !s->p_region) goto done;
    if(current_cue!=state->cue) {
        int left=INT_MAX,top=INT_MAX,right=0,bottom=0;
        size_t used=0;
        current_cue=state->cue; ++version; width=height=0; words[0]=0;
        for(subpicture_region_t *r=s->p_region;r;r=r->p_next) {
            for(text_segment_t *t=r->p_text;t;t=t->p_next) if(t->psz_text && used<sizeof(words)-1) {
                size_t len=strlen(t->psz_text);
                if(len>sizeof(words)-1-used) len=sizeof(words)-1-used;
                memcpy(words+used,t->psz_text,len); used+=len; words[used]=0;
            }
            if (used && r->p_next && used<sizeof(words)-1) { words[used++]='\n'; words[used]=0; }
            if(!r->p_picture || (r->fmt.i_chroma!=VLC_CODEC_RGBA && r->fmt.i_chroma!=VLC_CODEC_YUVP)) continue;
            if(r->i_x<0 || r->i_y<0 || r->i_x>8192 || r->i_y>8192 || r->fmt.i_visible_width>4096 || r->fmt.i_visible_height>2160) continue;
            left=__min(left,r->i_x); top=__min(top,r->i_y);
            right=__max(right,r->i_x+(int)r->fmt.i_visible_width);
            bottom=__max(bottom,r->i_y+(int)r->fmt.i_visible_height);
        }
        if(!used && right>left && bottom>top && (int64_t)(right-left)*(bottom-top)<=MAX_PIXELS) {
            width=right-left; height=bottom-top; memset(pixels,255,width*height);
            for(subpicture_region_t *r=s->p_region;r;r=r->p_next) {
                if(!r->p_picture || r->i_x<left || r->i_y<top || r->fmt.i_visible_width>(unsigned)(right-r->i_x) || r->fmt.i_visible_height>(unsigned)(bottom-r->i_y) || r->i_x>right || r->i_y>bottom) continue;
                plane_t *p=&r->p_picture->p[0];
                int rgba=r->fmt.i_chroma==VLC_CODEC_RGBA;
                if(!rgba && !(r->fmt.i_chroma==VLC_CODEC_YUVP && r->fmt.p_palette)) continue;
                for(unsigned y=0;y<r->fmt.i_visible_height;y++) for(unsigned x=0;x<r->fmt.i_visible_width;x++) {
                    unsigned char *v=p->p_pixels+y*p->i_pitch+x*p->i_pixel_pitch;
                    const uint8_t *color=rgba?v:r->fmt.p_palette->palette[*v];
                    int lum=rgba?(color[0]*77+color[1]*150+color[2]*29)/256:color[0];
                    pixels[(r->i_y-top+y)*width+(r->i_x-left+x)]=255-lum*color[3]/255;
                }
            }
        }
    }
    if(words[0] || width) { seen=GetTickCount64(); s->i_alpha=0; }
done:
    ReleaseSRWLockExclusive(&lock);
}
static int validate(subpicture_t *s,bool a,const video_format_t *src,bool b,const video_format_t *dst,vlc_tick_t ts) {
    subpicture_updater_t self=s->updater; wrapper *w=(wrapper*)self.p_sys;
    s->updater=w->orig;
    int rc=s->updater.pf_validate?s->updater.pf_validate(s,a,src,b,dst,ts):VLC_SUCCESS;
    w->orig=s->updater; s->updater=self;
    if(rc==VLC_SUCCESS) collect(s,w);
    return rc;
}
static void update(subpicture_t *s,const video_format_t *src,const video_format_t *dst,vlc_tick_t ts) {
    subpicture_updater_t self=s->updater; wrapper *w=(wrapper*)self.p_sys;
    s->updater=w->orig;
    if(s->updater.pf_update) s->updater.pf_update(s,src,dst,ts);
    w->orig=s->updater; s->updater=self; collect(s,w);
}
static void destroy(subpicture_t *s) {
    wrapper *w=(wrapper*)s->updater.p_sys; s->updater=w->orig;
    if(s->updater.pf_destroy) s->updater.pf_destroy(s);
    free(w);
}
struct filter_sys_t { int id; unsigned phase,count; double sum; };
static subpicture_t *wrap(filter_t *f,subpicture_t *s) {
    if(!s || !s->b_subtitle) return s;
    wrapper *w=malloc(sizeof(*w)); if(!w) return s;
    *w=(wrapper){s->updater,InterlockedIncrement(&cue_sequence),f->p_sys->id,s->i_alpha};
    subpicture_updater_t updater={validate,update,destroy,(subpicture_updater_sys_t*)w};
    /* Static PGS regions have no VLC updater storage. Let VLC allocate it
       through its own API before the renderer starts calling validate. */
    if (!s->p_private) {
        subpicture_t *wrapped=subpicture_New(&updater);
        if (!wrapped) { free(w); return s; }
        subpicture_private_t *priv=wrapped->p_private;
        *wrapped=*s; wrapped->updater=updater; wrapped->p_private=priv;
        s->p_region=NULL; subpicture_Delete(s); return wrapped;
    }
    s->updater=updater;
    return s;
}
static block_t *audio(filter_t *f,block_t *b) {
    if(!b) return b;
    filter_sys_t *st=f->p_sys;
    AcquireSRWLockExclusive(&lock);
    if(session==st->id && mode==LISTEN) {
        unsigned channels=f->fmt_in.audio.i_channels, rate=f->fmt_in.audio.i_rate;
        const float *v=(const float*)b->p_buffer;
        if(channels && rate>=16000 && b->i_nb_samples<=b->i_buffer/sizeof(float)/channels)
            for(unsigned i=0;i<b->i_nb_samples;i++) {
                for(unsigned c=0;c<channels;c++) st->sum+=v[i*channels+c];
                st->count++; st->phase+=16000;
                if(st->phase>=rate) {
                    double sample=st->sum/st->count/channels;
                    samples[write_pos]=(int16_t)(__min(1.0,__max(-1.0,sample))*32767);
                    write_pos=(write_pos+1)%SAMPLES; if(audio_count<SAMPLES) audio_count++;
                    st->phase-=rate; st->sum=0; st->count=0;
                }
            }
    } else { st->phase=st->count=0; st->sum=0; }
    ReleaseSRWLockExclusive(&lock);
    return b;
}
static int open_common(filter_t *f) {
    f->p_sys=calloc(1,sizeof(*f->p_sys)); if(!f->p_sys) return VLC_ENOMEM;
    f->p_sys->id=var_InheritInteger(f,"atelier-session"); return VLC_SUCCESS;
}
static int open_sub(vlc_object_t *obj) {
    filter_t *f=(filter_t*)obj; f->pf_sub_filter=wrap; return open_common(f);
}
static int open_audio(vlc_object_t *obj) {
    filter_t *f=(filter_t*)obj;
    f->fmt_in.audio.i_format=VLC_CODEC_FL32; aout_FormatPrepare(&f->fmt_in.audio);
    f->fmt_out.audio=f->fmt_in.audio; f->pf_audio_filter=audio; return open_common(f);
}
static void close_filter(vlc_object_t *obj) { free(((filter_t*)obj)->p_sys); }
vlc_module_begin()
    set_description("DiscAtelier subtitle capture")
    set_capability("sub filter",0)
    add_shortcut("atelier_captions")
    add_integer("atelier-session",0,"Playback session","Playback session",false)
    set_callbacks(open_sub,close_filter)
    add_submodule()
    set_description("DiscAtelier dialogue capture")
    set_capability("visualization",0)
    add_shortcut("atelier_dialogue")
    set_callbacks(open_audio,close_filter)
vlc_module_end()
