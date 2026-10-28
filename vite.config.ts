import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { DEV_REPOSITORY } from './dev/fixtures/people.ts';
import { devMocks, LIVE_MODE } from './dev/mock-plugin.ts';
import { parseRepository, REPO_VARIABLE, repositoryName } from './src/repository.ts';

export default defineConfig(({ command, mode }) => {
  // Builds and live mode show a real repository, named by PR_BOARD_REPO. Mock data is fictional, so the dev server
  // shows the fictional repository whatever the variable says.
  const real = command === 'build' || mode === LIVE_MODE;
  const repository = parseRepository(real ? process.env[REPO_VARIABLE] : DEV_REPOSITORY);
  return {
    // Relative asset paths, so the site works under any GitHub Pages path.
    base: './',
    plugins: [react(), devMocks({ repository })],
    define: { __PR_BOARD_REPO__: JSON.stringify(repositoryName(repository)) },
    server: { port: 5173 },
    build: { outDir: '_site', emptyOutDir: true },
  };
});
