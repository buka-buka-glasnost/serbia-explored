/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Set BASE_PATH=/<repo-name>/ when deploying under a sub-path (GitHub Pages).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'pipeline/**/*.test.ts'],
  },
});
