import adapter from '@sveltejs/adapter-cloudflare';

const config = {
  kit: {
    adapter: adapter(),
    csrf: {
      trustedOrigins: ['*']
    }
  },
  compilerOptions: {
    warningFilter(warning) {
      if (warning.code?.startsWith('a11y_')) return false;
      return true;
    }
  }
};

export default config;
