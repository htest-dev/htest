import { formatDiff } from "../src/util/format-diff.js";

const longPrefix = `${"chunk ".repeat(7)}tail`;
const elisionBase = Array.from({ length: 17 }, (_, i) => `line${i}`);

export default {
	name: "formatDiff()",
	run: formatDiff,
	map: value => value?.trim?.() ?? value,
	tests: [
		{
			name: "Type mismatch",
			args: [1, "1"],
			expect: `Got number, expected string
 Actual:   1
 Expected: "1"`,
		},
		{
			name: "Actual unmapped annotation",
			args: [1, "1", { actual: "raw" }],
			expect: `Got number, expected string
 Actual:   1 <dim>("raw" unmapped)</dim>
 Expected: "1"`,
		},
		{
			name: "Identical stringified values",
			args: [Number.NaN, Number.NaN],
			expect: ` Actual:   NaN <dim>(number)</dim>
 Expected: NaN <dim>(number)</dim>
 <dim>(values are stringified identically but not equal)</dim>`,
		},
		{
			name: "Inline char diff",
			args: ["abc", "adc"],
			expect: `Got "a<bg diff-removed-tint><b>b</b></bg>c", expected "a<bg diff-added-tint><b>d</b></bg>c"`,
		},
		{
			name: "Inline char diff with unmapped values",
			args: ["abc", "adc", { actual: "foo", expected: "bar" }],
			expect: `Got "a<bg diff-removed-tint><b>b</b></bg>c" <dim>("foo" unmapped)</dim>, expected "a<bg diff-added-tint><b>d</b></bg>c" <dim>("bar" unmapped)</dim>`,
		},
		{
			name: "Two-line word diff",
			args: [`${longPrefix} eta`, `${longPrefix} theta`],
			expect: ` Actual:   "${longPrefix} <bg diff-removed-tint><b>eta</b></bg>"
 Expected: "${longPrefix} <bg diff-added-tint><b>theta</b></bg>"`,
		},
		{
			name: "Two-line word diff with unmapped values",
			args: [`${longPrefix} eta`, `${longPrefix} theta`, { actual: "foo", expected: "bar" }],
			expect: ` Actual:   "${longPrefix} <bg diff-removed-tint><b>eta</b></bg>"
           <dim>"foo" unmapped</dim>
 Expected: "${longPrefix} <bg diff-added-tint><b>theta</b></bg>"
           <dim>"bar" unmapped</dim>`,
		},
		{
			name: "Inline multiline string diff",
			args: ["one\ntwo\nthree", "one\nTWO\nthree"],
			expect: `Got "one\\n<bg diff-removed-tint><b>two</b></bg>\\nthree", expected "one\\n<bg diff-added-tint><b>TWO</b></bg>\\nthree"`,
		},
		{
			name: "Elided array hunks",
			args: [
				elisionBase.map(line =>
					line === "line6" ? "X" : line === "line14" ? "Y" : line,
				),
				elisionBase.map(line =>
					line === "line6" ? "x" : line === "line14" ? "y" : line,
				),
			],
			expect: ` Actual ↔ Expected:
  <dim>… 5 matching lines …</dim>
  	"line4",
  	"line5",
<bg diff-removed>- \t"<bg diff-removed-tint><b>X</b></bg>",</bg>
<bg diff-added>+ \t"<bg diff-added-tint><b>x</b></bg>",</bg>
  	"line7",
  	"line8",
  <dim>… 3 matching lines …</dim>
  	"line12",
  	"line13",
<bg diff-removed>- \t"<bg diff-removed-tint><b>Y</b></bg>",</bg>
<bg diff-added>+ \t"<bg diff-added-tint><b>y</b></bg>",</bg>
  	"line15",
  	"line16",
  ]`,
		},
		{
			name: "Multi-line diff",
			// Wrap inputs so stringify() emits the raw text (with real `\n`)
			// and lineDiff triggers without hitting the array multi-line threshold.
			beforeEach () {
				let [actual, expected] = this.args;
				this.args[0] = { toJSON: () => actual };
				this.args[1] = { toJSON: () => expected };
			},
			tests: [
				{
					name: "paired char-diff with unmapped values",
					args: ["foo\nbar\n", "foo\nbaz\n", { actual: "bar", expected: "yolo" }],
					expect: ` Actual ↔ Expected:
  foo
<bg diff-removed>- ba<bg diff-removed-tint><b>r</b></bg></bg>
<bg diff-added>+ ba<bg diff-added-tint><b>z</b></bg></bg>
 <dim>Actual unmapped:   "bar"</dim>
 <dim>Expected unmapped: "yolo"</dim>`,
				},
				{
					name: "multiple paired lines",
					args: ["foo13\nbar42\n", "foo25\nbar47\n"],
					expect: ` Actual ↔ Expected:
<bg diff-removed>- foo<bg diff-removed-tint><b>13</b></bg></bg>
<bg diff-added>+ foo<bg diff-added-tint><b>25</b></bg></bg>
<bg diff-removed>- bar4<bg diff-removed-tint><b>2</b></bg></bg>
<bg diff-added>+ bar4<bg diff-added-tint><b>7</b></bg></bg>`,
				},
				{
					name: "noisy swap collapses via cleanup",
					args: ["fix: button alignment\n", "fix: button padding\n"],
					expect: ` Actual ↔ Expected:
<bg diff-removed>- fix: button <bg diff-removed-tint><b>alignment</b></bg></bg>
<bg diff-added>+ fix: button <bg diff-added-tint><b>padding</b></bg></bg>`,
				},
				{
					name: "unequal counts stay plain",
					args: ["foo\nbar\n", "baz\n"],
					expect: ` Actual ↔ Expected:
<bg diff-removed>- <bg diff-removed-tint><b>foo</b></bg></bg>
<bg diff-removed>- <bg diff-removed-tint><b>bar</b></bg></bg>
<bg diff-added>+ <bg diff-added-tint><b>baz</b></bg></bg>`,
				},
				{
					name: "added line",
					args: ["foo\n", "foo\nbar\n"],
					expect: ` Actual ↔ Expected:
  foo
<bg diff-added>+ <bg diff-added-tint><b>bar</b></bg></bg>`,
				},
				{
					name: "removed line",
					args: ["foo\nbar\n", "foo\n"],
					expect: ` Actual ↔ Expected:
  foo
<bg diff-removed>- <bg diff-removed-tint><b>bar</b></bg></bg>`,
				},
			],
		},
	],
};
