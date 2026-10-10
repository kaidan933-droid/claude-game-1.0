import {fileURLToPath} from 'url';
// Relative asset paths so the build works under https://<user>.github.io/<repo>/
// Two pages: the GT3 RS game (index.html) and the original scooter race (scooter.html).
export default {
  base:'./',
  build:{rollupOptions:{input:{
    main:fileURLToPath(new URL('./index.html',import.meta.url)),
    scooter:fileURLToPath(new URL('./scooter.html',import.meta.url))
  }}}
};
