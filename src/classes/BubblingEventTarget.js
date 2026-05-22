export default class BubblingEventTarget extends EventTarget {
	parent = null;

	constructor () {
		super();
	}

	dispatchEvent (event) {
		if (event.bubbles) {
			let parent = this;
			while ((parent = parent.parent)) {
				let target = event.detail?.target ?? event.target ?? this;
				let newEvent = new CustomEvent(event.type, {
					...event,
					detail: { target },
				});
				parent.dispatchEvent(newEvent);
			}
		}

		return super.dispatchEvent(event);
	}
}
