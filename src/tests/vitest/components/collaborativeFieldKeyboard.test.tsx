import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CollaborationInputField,
  CollaborationTextArea,
  ValidatedInputField,
} from "components/interface/form/globalFieldsAutomerge";

vi.mock("utils/useAppSelector", () => ({ useAppSelector: () => true, refEqual: Object.is }));

let container: HTMLDivElement;
let root: Root;
const showModal = vi.fn();

beforeAll(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("innerWidth", 360);
});
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: showModal,
  });
  showModal.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test.each([
  { name: "CollaborationInputField", Component: CollaborationInputField },
  { name: "CollaborationTextArea", Component: CollaborationTextArea },
  { name: "ValidatedInputField", Component: ValidatedInputField },
])(
  "$name opens from the wrapper while preserving keyboard events inside the editor",
  ({ Component }) => {
    act(() => {
      root.render(
        <Component
          value="initial"
          editMode
          fieldProps={{ name: "name", ariaLabel: "Name" }}
          onSubmit={vi.fn()}
        />
      );
    });
    const wrapper = container.querySelector<HTMLElement>('[role="button"]');
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(new DOMRect(330, 20, 200, 20));
    const activation = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    act(() => wrapper.dispatchEvent(activation));
    expect(activation.defaultPrevented).toBe(true);
    expect(showModal).toHaveBeenCalledTimes(1);
    const dialogContents = container.querySelector<HTMLElement>("dialog > div");
    expect(dialogContents.style.left).toBe("156px");
    expect(dialogContents.style.width).toBe("200px");
    expect(dialogContents.style.right).toBe("auto");

    const editor = container.querySelector("input, textarea");
    for (const key of [" ", "Enter"]) {
      const typing = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      act(() => editor.dispatchEvent(typing));
      expect(typing.defaultPrevented).toBe(false);
    }
    expect(showModal).toHaveBeenCalledTimes(1);

    const completion = container.querySelector<HTMLButtonElement>(
      Component === ValidatedInputField ? "button:last-child" : "button"
    );
    expect(completion?.textContent).toBe(Component === ValidatedInputField ? "Save" : "Done");
    expect(completion?.type).toBe("button");
  }
);
