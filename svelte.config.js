import adapter from '@sveltejs/adapter-cloudflare';

const config = {
  kit: {
    adapter: adapter(),
    csrf: {
      checkOrigin: false
    }
  }
};

export default config;
