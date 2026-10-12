// Entrada de produção (pm2). O pm2 importa o script em vez de executá-lo, então
// o `import.meta.main` do index.js é falso lá e o servidor nunca subiria.
import { listen } from './index.js';

listen();
