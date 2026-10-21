import { defineConfig } from 'vite';
export default defineConfig({
  root: 'mobile',
  build: { outDir: '../mobile-dist', emptyOutDir: false, cssCodeSplit: false,
    rollupOptions: { output: { entryFileNames: 'phone.js', assetFileNames: 'phone.[ext]' } } },
});
