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
			expect: `Got "a<bg red><b>b</b></bg>c", expected "a<bg green><b>d</b></bg>c"`,
		},
		{
			name: "Two-line word diff",
			args: [`${longPrefix} eta`, `${longPrefix} theta`],
			expect: ` Actual:   "${longPrefix} <bg red><b>eta</b></bg>"
 Expected: "${longPrefix} <bg green><b>theta</b></bg>"`,
		},
		{
			name: "Inline multiline string diff",
			args: ["one\ntwo\nthree", "one\nTWO\nthree"],
			expect: `Got "one\\n<bg red><b>two</b></bg>\\nthree", expected "one\\n<bg green><b>TWO</b></bg>\\nthree"`,
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
<bg lightblack>- \t"<bg red><b>X</b></bg>",</bg>
<bg lightblack>+ \t"<bg green><b>x</b></bg>",</bg>
  	"line7",
  	"line8",
  <dim>… 3 matching lines …</dim>
  	"line12",
  	"line13",
<bg lightblack>- \t"<bg red><b>Y</b></bg>",</bg>
<bg lightblack>+ \t"<bg green><b>y</b></bg>",</bg>
  	"line15",
  	"line16",
  ]`,
		},
		{
			name: "Char-diff on long line with small change",
			args: [
				elisionBase.map(line => line === "line6" ? "a long line with v1 change" : line),
				elisionBase.map(line => line === "line6" ? "a long line with v2 change" : line),
			],
			expect: ` Actual ↔ Expected:
  <dim>… 5 matching lines …</dim>
  	"line4",
  	"line5",
<bg lightblack>- \t"a long line with v<bg red><b>1</b></bg> change",</bg>
<bg lightblack>+ \t"a long line with v<bg green><b>2</b></bg> change",</bg>
  	"line7",
  	"line8",
  <dim>… 9 matching lines …</dim>`,
		},
	],
};
