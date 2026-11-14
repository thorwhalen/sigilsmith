import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// sigilsmith is linked from ../.. (file:), so dedupe the peers it shares with the app.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'zod', '@zodal/core', '@zodal/store', '@zodal/ui', '@zodal/dials-core', '@zodal/dials-ui'] },
});
