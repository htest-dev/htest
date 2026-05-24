---
toc: false
---

# Overview

The guiding design principles behind hTest are:
1. **Users should not have to write more code than the minimum necessary to (clearly and unambiguously) declare their intent.**
Data and logic should have a single point of truth.
2. **Incremental user effort should provide incremental value.**
It should be able to run a test as soon as you have the inputs and expected result, metadata can wait (or be generated automatically).
3. **Be liberal in what you accept ([robustness principle](https://en.wikipedia.org/wiki/Robustness_principle))**.
hTest parameters should accept a wide range of inputs and just deal with them. Internal complexity is preferred over external (user-facing) complexity.

The way hTest implements these design principles is better illustrated with an example.
Most (all?) JS testing frameworks have adopted a similar syntax involving nested callbacks, which in practice ends up involving a lot of redundant duplicate effort and boilerplate code.

As an example, this is the sample test from [Mocha’s homepage](https://mochajs.org/#getting-started):

```js
var assert = require('assert');
describe('Array', function () {
  describe('#indexOf()', function () {
    it('should return -1 when the value is not present', function () {
      assert.equal([1, 2, 3].indexOf(4), -1);
    });
  });
});
```

Most testing frameworks have a similar syntax: tests are defined via nested callbacks, and assertions via function calls.

If we want to stay as close to the original test as possible, the hTest equivalent would be:

```js
export default {
	name: "Array",
	tests: [{
		name: "#indexOf()",
		tests: [
			{
				name: "should return -1 when the value is not present",
				run: () => [1, 2, 3].indexOf(4),
				expect: -1,
			}
		]
	}]
}
```

However, this way of writing tests does not do hTest justice.
Suppose we wanted to test more results for `indexOf()` and more array methods (e.g. `array.find()`).

The Mocha code would look like this:

```js
var assert = require('assert');
describe('Array', function () {
  describe('#indexOf()', function () {
	it('should return -1 when the value is not present', function () {
	  assert.equal([1, 2, 3].indexOf(4), -1);
	});
	it('should return 0 when the value is 1', function () {
	  assert.equal([1, 2, 3].indexOf(1), 0);
	});
	it('should return 3 when the value is 1 and starting from 3', function () {
	  assert.equal([1, 1, 1, 1].indexOf(1, 3), 3);
	});
  });

  describe('#with()', function () {
	it('should return 2 when looking for an even number', function () {
	  assert.equal([1, 2, 3].find(x => x % 2 === 0), 2);
	});
	it('should return undefined no element matches', function () {
	  assert.equal([1, 2, 3].find(x => x === 4), undefined);
	});
  });
});
```

We *could* write hTest code that is similar:

<details>
<summary>Show what that would look like</summary>

```js
export default {
	name: "Array",
	tests: [
		{
			name: "#indexOf()",
			tests: [
				{
					name: "should return -1 when the value is not present",
					run: () => [1, 2, 3].indexOf(4),
					expect: -1,
				},
				{
					name: "should return 0 when the value is 1",
					run: () => [1, 2, 3].indexOf(1),
					expect: 0,
				},
				{
					name: "should return 3 when the value is 1 and starting from 3",
					run: () => [1, 1, 1, 1].indexOf(1, 3),
					expect: 3,
				}
			]
		},
		{
			name: "#find()",
			tests: [
				{
					name: "should return 2 when looking for an even number",
					run: () => [1, 2, 3].find(x => x % 2 === 0),
					expect: 2,
				},
				{
					name: "should return undefined when no element matches",
					run: () => [1, 2, 3].find(x => x === 4),
					expect: undefined,
				}
			]
		}
	]
}
```

</details>

While this already looks cleaner, it doesn’t really illustrate hTest’s value proposition.
Where hTest shines is that it allows us to abstract repetition away and have a single point of truth.
This is what the hTest code would look like:

```js
export default {
	name: "Array",
	run (...args) {
		let {method, arr} = this.data;
		return arr[method](...args);
	},
	data: { // custom inherited data
		arr: [1, 2, 3]
	},
	getName () {
		if (this.level === 1) {
			return "#" + this.data.method + "()";
		}

		return `should return ${this.expect} when the value is ${this.args[0]}`;
	},
	tests: [
		{
			data: {
				method: "indexOf",
			},
			tests: [
				{
					name: "should return -1 when the value is not present",
					arg: 4,
					expect: -1,
				},
				{
					arg: 1,
					expect: 0,
				},
				{
					data: {
						arr: [1, 1, 1, 1]
					},
					name: "should return 3 when the value is 1 and starting from 3",
					args: [1, 3],
					expect: 3,
				}
			]
		},
		{
			data: {
				method: "find",
			},
			tests: [
				{
					name: "should return 2 when looking for an even number",
					arg: x => x % 2 === 0,
					expect: 2,
				},
				{
					name: "should return undefined when no element matches",
					arg: x => x === 4,
					expect: undefined,
				}
			]
		}
	]
}
```

Here we moved the commonalities to test parents and used inherited data to pass the array and code to be tested to the tests.
We are also only specifying a name when it's non-obvious, and using the `getName` method to generate the name for us
(even with no `getName` method, hTest will generate a name for us based on the test parameters).

Notice that there is a spectrum between how much you want to abstract away and how much you want to specify in each test.
It’s up to you where your tests would be in that spectrum.
You may prefer to keep inherited settings simple, and add local overrides,
or you may prefer to add more code at the root, so the tests can be as lean as possible.
hTest allows you to do both.

Have a huge test suite in another testing framework and converting seems like a daunting task?
Or maybe you like hTest’s test specification syntax, but prefer another testing framework’s test runners?
Because hTest’s tests are declarative, you can actually *convert* them to any other testing framework!

There are existing adapters for the following frameworks:
- Coming soon
