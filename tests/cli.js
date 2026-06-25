import { mergeOptions } from "../src/util/options.js";

export default {
	name: "CLI",
	tests: [
		{
			name: "mergeOptions precedence",
			description: "Pins the precedence contract: flag > positional > programmatic > config.",
			run: ({ config, options, positionals = [], flags } = {}) =>
				mergeOptions(config, options, positionals, flags),
			tests: [
				{
					name: "Positionals fill empty location and path",
					arg: { positionals: ["./tests", "0/1"] },
					expect: { location: "./tests", path: "0/1" },
				},
				{
					name: "Programmatic > config",
					arg: {
						config: { location: "/from/config", verbose: true },
						options: { location: "/from/prog" },
					},
					expect: { location: "/from/prog", verbose: true },
				},
				{
					name: "Positional > programmatic > config",
					arg: {
						config: { location: "/from/config" },
						options: { location: "/from/prog" },
						positionals: ["/from/argv"],
					},
					expect: { location: "/from/argv" },
				},
				{
					name: "Flag > positional > programmatic > config for location",
					arg: {
						config: { location: "/from/config" },
						options: { location: "/from/prog" },
						positionals: ["/from/argv", "0/2"],
						flags: { location: "/from/flag" },
					},
					expect: { location: "/from/flag", path: "0/2" },
				},
				{
					name: "Flag > positional for path",
					arg: {
						positionals: ["./loc", "0/2"],
						flags: { path: "0/3" },
					},
					expect: { location: "./loc", path: "0/3" },
				},
				{
					name: "Omitted layers don't crash",
					arg: { positionals: ["./tests"], flags: { ci: true } },
					expect: { location: "./tests", ci: true },
				},
			],
		},
	],
};
