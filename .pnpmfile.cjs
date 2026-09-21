// These two plugins still declare ESLint 9 as their maximum. The config wraps
// both in @eslint/compat, and tests/lint-tooling.mjs exercises real failing rules.
// Remove this version-scoped metadata correction once upstream supports ESLint 10.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (
        (pkg.name === 'eslint-plugin-react' && pkg.version === '7.37.5') ||
        (pkg.name === 'eslint-plugin-jsx-a11y' && pkg.version === '6.10.2')
      ) {
        pkg.peerDependencies.eslint += ' || ^10';
      }
      return pkg;
    },
  },
};
