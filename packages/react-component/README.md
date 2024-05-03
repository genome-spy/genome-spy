# Genome Spy React Component

This package exports a `<GenomeSpy />` React component that makes GenomeSpy's functionality available in React applications.

It is just a simple wrapper around the core library's `embed` function, but it is provided to React developers as the canonical way to integrate GenomeSpy into a React application.

## Usage

The component takes two props:

1. `spec`: This is the specification object as documented in the [GenomeSpy Docs](https://genomespy.app/docs/grammar/).
2. `onEmbed`: This callback function receives the results from the `embed` function as an argument. In other words, this gives you access to the [JavaScript API](https://genomespy.app/docs/api/#the-api)

For a practical example, check the React component example in the [embed-examples](https://github.com/genome-spy/genome-spy/tree/master/packages/embed-examples) package.
