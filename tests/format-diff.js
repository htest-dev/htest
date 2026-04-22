import { formatDiff } from "../src/format-diff.js";

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
			expect: `Got "a<c red><b>b</b></c>c", expected "a<c green><b>d</b></c>c"`,
		},
		{
			name: "Two-line word diff",
			args: [`${longPrefix} eta`, `${longPrefix} theta`],
			expect: ` Actual:   "${longPrefix} <c red><b>eta</b></c>"
 Expected: "${longPrefix} <c green><b>theta</b></c>"`,
		},
		{
			name: "Inline multiline string diff",
			args: ["one\ntwo\nthree", "one\nTWO\nthree"],
			expect: `Got "one\\n<c red><b>two</b></c>\\nthree", expected "one\\n<c green><b>TWO</b></c>\\nthree"`,
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
<c red>- \t"<b>X</b>",</c>
<c green>+ \t"<b>x</b>",</c>
  	"line7",
  	"line8",
  <dim>… 3 matching lines …</dim>
  	"line12",
  	"line13",
<c red>- \t"<b>Y</b>",</c>
<c green>+ \t"<b>y</b>",</c>
  	"line15",
  	"line16",
  ]`,
		},
	],
};
