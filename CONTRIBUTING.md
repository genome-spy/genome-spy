# Contributing to GenomeSpy

Thank you for considering contributing GenomeSpy.

## Commit Guidelines

### Atomic Commits

Every commit should be atomic, encapsulating a single change. This practice
enhances clarity and simplifies code review and bug tracing. Before pushing,
review your commits to ensure each represents a single logical change.

### Conventional Commits and Commitlint

We adhere strictly to the [conventional
commits](https://www.conventionalcommits.org/en/v1.0.0/) specification to
maintain a clean, navigable, and informative commit history. To facilitate this,
commit messages should be validated using
[commitlint](https://commitlint.js.org/). Running `npm install` will install
git hooks that will validate your commit messages automatically.

If applicable, the scope in the commit message should be the package name, e.g.,
`core` or `app`. However, when making commits that will be squashed into a
single commit, the scope can be omitted.

## Coding Practices

### Language and Typings

Our codebase is primarily JavaScript, utilizing
[JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
for type annotations. The TypeScript language server in VSCode uses the JSDoc
comments for type checking. Before pushing your changes, ensure that your code
is correctly typed and passes the type checking. You can run the type checking with:

```sh
npm -ws --if-present run test:tsc
```

### Code Formatting with Prettier

To ensure code consistency and readability, all contributions must adhere to our
formatting standards, enforced by [Prettier](https://prettier.io/). We recommend
running Prettier before submitting your contributions to avoid
formatting-related revisions. The Prettier
[extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
for VSCode is recommended for automatic formatting.

### Editor Configuration

We provide an `.editorconfig` file to help maintain consistent coding styles for
various editors and IDEs. VSCode users need an
[extension](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)
to leverage these settings automatically.

### Ensure High Performance in Hot Paths

GenomeSpy is a high-performance visualization toolkit, and we strive to maintain
this standard in all aspects of the project. When making changes, especially in
hot paths of GenomeSpy's data flow, ensure that the performance is not
compromised. Particularly, avoid creating large numbers of objects in loops, if
the objects are to be discarded soon after.

However, premature optimization is discouraged and code readability is preferred
over unnecessary performance hacks. Instead, use the performance tools provided
by the browser to identify bottlenecks and optimize accordingly.

### Testing

GenomeSpy uses [vitest](https://vitest.dev/) for both unit and integration
testing. While our unit tests are thorough, we recognize a need for stronger
integration testing. Contributions aimed at enhancing our integration test suite
are especially welcome and needed. Tests can be run with:

```sh
npm run test
```

## How to Contribute

Before making contributions, please familiarize yourself with the following
processes to ensure a smooth and efficient collaboration.

### Setting Up Your Development Environment

Setting up a local development environment is the first step. VSCode is the
recommended IDE for GenomeSpy development, as it provides a seamless development
experience with integrated tools and extensions. However, any IDE that supports
JavaScript and TypeScript can be used.

### Debugging

The following entry (with a correct `pathMapping`) in VSCode's `launch.json` can
be used to debug the GenomeSpy app:

```json
{
  "type": "chrome",
  "request": "launch",
  "name": "GenomeSpy App",
  "url": "http://localhost:8080/",
  "sourceMaps": false,
  "webRoot": "${workspaceFolder}/packages/app/src",
  "pathMapping": {
    "/@fs/Users/klavikka/genome-spy/packages/core/src": "${workspaceFolder}/packages/core/src"
  },
  "enableContentValidation": false
}
```

The `enableContentValidation` property is essential, as we don't use source maps
during development. However, vite rewrites the imports, making the content
validation fail.

### Development Server

See the [`README.md`](./README.md) for instructions on how to start the development server.

### Submitting Pull Requests

All changes should be submitted through pull requests (PRs). Please provide a
clear and detailed description of your changes, including the motivation and
context behind them. PRs undergo a review process, and constructive feedback
should be expected and welcomed.

### Documentation

If new features are introduced in your pull request, please also update the
documentation in the [`docs/`](docs/) directory. If the changes alter the
visualization grammar, the typings and their documentation in the
[`packages/core/src/spec/`](packages/core/src/spec/) directory should also be
updated.

## Community and Communication

We encourage open and respectful communication within our community. If you have
questions, suggestions, or need clarification on any aspect of the project,
please feel free to reach out through GitHub
[discussions](https://github.com/genome-spy/genome-spy/discussions) or
[issues](https://github.com/genome-spy/genome-spy/issues).
