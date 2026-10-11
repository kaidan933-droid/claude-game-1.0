import {fileURLToPath} from 'url';
// Relative asset paths so the build works under https://<user>.github.io/<repo>/
// Two pages: the GT3 RS game (index.html) and the motorcycle race (bikes.html).
export default {
  base:'./',
  build:{rollupOptions:{input:{
    main:fileURLToPath(new URL('./index.html',import.meta.url)),
    bikes:fileURLToPath(new URL('./bikes.html',import.meta.url))
  }}}
};
