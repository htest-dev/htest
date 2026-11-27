/**
 * Docspire theme shared by htest.dev and html.htest.dev: brand colors, code colors, logo and footer.
 * A site spreads `site` into its config and lists the theme among its plugins.
 */
export default {
	id: "htest-theme",
	url: import.meta.url,
	styles: ["brand.css", "prism.css"],
	slotted: {
		"content.after.end": "site-footer",
	},
};

/** Site options both sites share */
export const site = {
	title: "hTest",
	title_html: `<span><strong>h</strong>Test</span>`,
	icon: "/assets/images/logo.svg",
	deleteOutput: true,
};
