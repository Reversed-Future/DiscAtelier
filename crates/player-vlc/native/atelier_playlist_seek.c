/* VLC's callback input advertises only sequential-speed seeking. Our Blu-ray
 * reader uses the disc index for random access, so the TS demuxer can probe
 * timestamps and seek the selected playlist. Only the direct route opts in. */
#define MODULE_STRING "atelier_playlist_seek"
#define __PLUGIN__ 1
#include <winsock2.h>
static inline int poll(struct pollfd *fds, unsigned n, int timeout) { return WSAPoll(fds, n, timeout); }
#include <vlc_common.h>
#include <vlc_plugin.h>
#include <vlc_stream.h>

static ssize_t read_stream(stream_t *s, void *buffer, size_t size) {
    return vlc_stream_ReadPartial(s->p_source, buffer, size);
}
static int seek_stream(stream_t *s, uint64_t offset) {
    return vlc_stream_Seek(s->p_source, offset);
}
static int control_stream(stream_t *s, int query, va_list args) {
    if (query == STREAM_CAN_FASTSEEK) {
        *va_arg(args, bool *) = true;
        return VLC_SUCCESS;
    }
    return vlc_stream_vaControl(s->p_source, query, args);
}
static int open_stream(vlc_object_t *obj) {
    stream_t *s = (stream_t *)obj;
    bool seekable = false;
    if (!obj->obj.force || vlc_stream_Control(s->p_source, STREAM_CAN_SEEK, &seekable) != VLC_SUCCESS || !seekable)
        return VLC_EGENERIC;
    s->pf_read = read_stream;
    s->pf_seek = seek_stream;
    s->pf_control = control_stream;
    return VLC_SUCCESS;
}
vlc_module_begin()
    set_description("DiscAtelier indexed Blu-ray input")
    set_capability("stream_filter", 0)
    add_shortcut("atelier_playlist_seek")
    set_callbacks(open_stream, NULL)
vlc_module_end()
