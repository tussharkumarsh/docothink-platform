// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/lib/errors";

const saved = { current: { ok: true, message: "Draft saved." } as ActionResult };
const savePrescriptionAction = vi.fn(async () => saved.current);
const saveTemplateAction = vi.fn(async () => saved.current);
const addExceptionAction = vi.fn(async () => saved.current);

vi.mock("@/features/doctor/actions", () => ({ savePrescriptionAction, addExceptionAction }));
vi.mock("../actions", () => ({ saveTemplateAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { PrescriptionEditor } = await import("./prescription-editor");
const { TemplateForm } = await import("./template-form");
const { BlockProvider, BlockDayButton } = await import("@/features/calendar/components/block-dialog");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rx = (over = {}) =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    status: "draft",
    diagnosis: "Original diagnosis",
    treatment_plan: "",
    advice: "",
    follow_up: "",
    prescription_items: [{ id: "a", position: 0, medication_name: "Original medicine", strength: "", dosage_form: "", dose: "", route: "", frequency: "", duration: "", instructions: "" }],
    ...over,
  }) as never;

const template = { id: "t1", name: "Viral fever", items: [{ medication_name: "Paracetamol" }], treatment_plan: null, advice: "Rest", follow_up: null };

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  saved.current = { ok: true, message: "Draft saved." };
  // jsdom doesn't implement the modal dialog methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const field = <T extends HTMLElement = HTMLInputElement>(name: string) => host.querySelector(`[name="${name}"]`) as unknown as T;

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("PrescriptionEditor", () => {
  it("keeps what the doctor typed on screen after Save draft", async () => {
    act(() => root.render(<PrescriptionEditor rx={rx()} templates={[template]} />));
    type(field<HTMLTextAreaElement>("diagnosis"), "New diagnosis");
    type(field("items.0.medication_name"), "New medicine");
    await click(button("Save draft"));

    expect(savePrescriptionAction).toHaveBeenCalledTimes(1);
    expect(field<HTMLTextAreaElement>("diagnosis").value).toBe("New diagnosis");
    expect(field("items.0.medication_name").value).toBe("New medicine");
  });

  it("sends the pressed button's intent and the typed values", async () => {
    act(() => root.render(<PrescriptionEditor rx={rx()} templates={[template]} />));
    type(field<HTMLTextAreaElement>("diagnosis"), "New diagnosis");
    await click(button("Save draft"));

    const data = (savePrescriptionAction.mock.calls[0] as unknown as [ActionResult, FormData])[1];
    expect(data.get("intent")).toBe("draft");
    expect(data.get("diagnosis")).toBe("New diagnosis");
  });

  it("keeps typed values when the save is refused", async () => {
    saved.current = { ok: false, error: "Each medicine needs a name; fields must be shorter." };
    act(() => root.render(<PrescriptionEditor rx={rx()} templates={[template]} />));
    type(field<HTMLTextAreaElement>("diagnosis"), "New diagnosis");
    await click(button("Save draft"));

    expect(field<HTMLTextAreaElement>("diagnosis").value).toBe("New diagnosis");
  });

  it("keeps template text and medicines on screen after Save draft", async () => {
    act(() => root.render(<PrescriptionEditor rx={rx()} templates={[template]} />));
    const select = host.querySelector("#use_template") as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "t1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(field<HTMLTextAreaElement>("advice").value).toBe("Rest");
    await click(button("Save draft"));

    expect(field<HTMLTextAreaElement>("advice").value).toBe("Rest");
    expect(field("items.1.medication_name").value).toBe("Paracetamol");
  });

  it("doesn't lose unsaved rows when the page refreshes with new item ids", async () => {
    act(() => root.render(<PrescriptionEditor rx={rx()} templates={[template]} />));
    await click(button("Add medicine"));
    type(field("items.1.medication_name"), "Unsaved medicine");
    const refreshed = rx({ prescription_items: [{ id: "b", position: 0, medication_name: "Original medicine", strength: "", dosage_form: "", dose: "", route: "", frequency: "", duration: "", instructions: "" }] });
    act(() => root.render(<PrescriptionEditor rx={refreshed} templates={[template]} />));

    expect(field("items.1.medication_name").value).toBe("Unsaved medicine");
  });
});

describe("TemplateForm", () => {
  it("keeps everything typed when the save is refused", async () => {
    saved.current = { ok: false, error: "You already have a template with this name." };
    act(() => root.render(<TemplateForm template={null} />));
    type(field("name"), "Viral fever");
    type(field("items.0.medication_name"), "Paracetamol");
    type(field<HTMLTextAreaElement>("advice"), "Rest");
    await click(button("Save template"));

    expect(saveTemplateAction).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("You already have a template with this name.");
    expect(field("name").value).toBe("Viral fever");
    expect(field("items.0.medication_name").value).toBe("Paracetamol");
    expect(field<HTMLTextAreaElement>("advice").value).toBe("Rest");
  });
});

describe("Block dialog", () => {
  it("keeps the chosen length showing after a clash warning", async () => {
    saved.current = { ok: true, message: "Time blocked for new bookings. You still have confirmed appointments in this period." };
    act(() => root.render(<BlockProvider timezone="UTC"><BlockDayButton date="2026-11-10" startMin={600} label="Tuesday" /></BlockProvider>));
    await click(host.querySelector("button") as HTMLButtonElement);
    const length = host.querySelector("#block-length") as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(length, "rest");
      length.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click([...host.querySelectorAll("dialog button")].at(-1) as HTMLButtonElement);

    expect(addExceptionAction).toHaveBeenCalledTimes(1);
    expect((host.querySelector("#block-length") as HTMLSelectElement).value).toBe("rest");
  });

  it("can't create a second block after the clash warning", async () => {
    saved.current = { ok: true, message: "Time blocked for new bookings. You still have confirmed appointments in this period." };
    act(() => root.render(<BlockProvider timezone="UTC"><BlockDayButton date="2026-11-10" startMin={600} label="Tuesday" /></BlockProvider>));
    await click(host.querySelector("button") as HTMLButtonElement);
    await click([...host.querySelectorAll("dialog button")].at(-1) as HTMLButtonElement);

    expect(addExceptionAction).toHaveBeenCalledTimes(1);
    expect([...host.querySelectorAll("dialog button")].map((b) => b.textContent)).toEqual(["Close"]);
  });
});
