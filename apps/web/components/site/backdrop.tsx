/**
 * The room the documents sit in.
 *
 * Two fixed, `aria-hidden`, `pointer-events-none` elements behind everything. All of the
 * treatment is in `globals.css` under THE BACKDROP, including why an infinite loop is allowed
 * here and nowhere else, and what each layer is derived from. This file exists only so the
 * layout has one thing to mount and so the markup carries no classes worth misreading.
 *
 * NOT a client component. It has no state, no effect and no listener: the whole thing is CSS,
 * so it costs zero JavaScript and it is present in the first server response. That matters —
 * a backdrop that arrives on hydration is a flash of a different page.
 *
 * The gutter rule is a second element rather than a third background layer on the first
 * because it is anchored to the left edge while the grain and the scan band fill the viewport,
 * and stacking those on one element would mean four background layers whose sizes disagree.
 */
export function Backdrop() {
  return (
    <>
      <div data-backdrop aria-hidden="true" />
      <div data-gutter-rule aria-hidden="true" className="hidden xl:block" />
    </>
  );
}
