// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InlineAmountEditor from "./InlineAmountEditor";
import type { SerializedExpense } from "@/lib/data";

function makeExpense(overrides: Partial<SerializedExpense> = {}): SerializedExpense {
  return {
    id: "exp-1",
    month: 1,
    year: 2026,
    category: "HOTEL",
    status: "NEEDS_REVIEW",
    vendor: "Fairmont",
    description: null,
    serviceDate: null,
    invoiceDate: null,
    receivedDate: "2026-01-10T00:00:00.000Z",
    amount: 100,
    parsedAmount: 100,
    taxAmount: null,
    currency: "CAD",
    convertedAmount: null,
    convertedCurrency: null,
    effectiveAmount: 100,
    amountManuallyOverridden: false,
    amountOverrideTimestamp: null,
    amountOverrideSource: null,
    amountOverrideUser: null,
    version: "2026-01-10T00:00:00.000Z",
    invoiceNumber: null,
    cardLast4: null,
    tripRoute: null,
    hotelCheckIn: null,
    hotelCheckOut: null,
    guestName: null,
    hotelCity: null,
    pickupAddress: null,
    pickupCity: null,
    dropoffAddress: null,
    dropoffCity: null,
    tripCountry: null,
    sourceType: "FINAL_INVOICE",
    possibleCancellation: false,
    receiptSource: "NONE",
    confidenceScore: 0.9,
    classificationReason: null,
    gmailMessageId: "msg-1",
    gmailThreadId: null,
    emailSender: "billing@fairmont.com",
    emailSubject: "Your receipt",
    emailLink: "https://mail.google.com/mail/u/0/#inbox/msg-1",
    isMock: true,
    reviewNote: null,
    attachments: [],
    duplicateOf: [],
    supersededBy: null,
    ...overrides,
  };
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("InlineAmountEditor", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the amount and opens inline edit mode on click", async () => {
    render(<InlineAmountEditor expense={makeExpense()} onSaved={vi.fn()} />);
    expect(screen.getByRole("button", { name: /CA\$100/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    expect(screen.getByLabelText(/edit amount/i)).toBeInTheDocument();
  });

  it("saves a valid corrected amount", async () => {
    const onSaved = vi.fn();
    globalThis.fetch = mockFetchOnce(200, { expense: makeExpense({ effectiveAmount: 84.2 }) }) as unknown as typeof fetch;

    render(<InlineAmountEditor expense={makeExpense()} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.clear(input);
    await user.type(input, "84.20");
    await user.click(screen.getByRole("button", { name: "Save amount" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({ amount: "84.20", source: "INLINE_LIST_EDIT" });
  });

  it("cancels an edit without saving", async () => {
    globalThis.fetch = vi.fn();
    render(<InlineAmountEditor expense={makeExpense()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    await user.type(screen.getByLabelText(/edit amount/i), "999");
    await user.click(screen.getByRole("button", { name: "Cancel editing amount" }));

    expect(screen.queryByLabelText(/edit amount/i)).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("saves on Enter", async () => {
    const onSaved = vi.fn();
    globalThis.fetch = mockFetchOnce(200, { expense: makeExpense() }) as unknown as typeof fetch;
    render(<InlineAmountEditor expense={makeExpense()} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.clear(input);
    await user.type(input, "50{Enter}");

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("cancels on Escape", async () => {
    globalThis.fetch = vi.fn();
    render(<InlineAmountEditor expense={makeExpense()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.type(input, "{Escape}");

    expect(screen.queryByLabelText(/edit amount/i)).not.toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid text and keeps the entered value", async () => {
    globalThis.fetch = mockFetchOnce(400, { error: "Enter a valid amount, e.g. 1234.56 or CAD 1,234.56." }) as unknown as typeof fetch;
    render(<InlineAmountEditor expense={makeExpense()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.clear(input);
    await user.type(input, "not a number");
    await user.click(screen.getByRole("button", { name: "Save amount" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid amount/i);
    expect(input).toHaveValue("not a number");
  });

  it("rejects more than 2 decimal places", async () => {
    globalThis.fetch = mockFetchOnce(400, { error: "Amounts can have at most 2 decimal places." }) as unknown as typeof fetch;
    render(<InlineAmountEditor expense={makeExpense()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.clear(input);
    await user.type(input, "12.345");
    await user.click(screen.getByRole("button", { name: "Save amount" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/2 decimal places/i);
  });

  it("requires confirmation for a zero amount, then allows confirming it", async () => {
    const onSaved = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Confirm that this expense is really $0.00 before saving.", requiresZeroConfirmation: true }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ expense: makeExpense({ effectiveAmount: 0 }) }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<InlineAmountEditor expense={makeExpense()} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Save amount" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/\$0\.00/);
    await user.click(screen.getByRole("button", { name: "Confirm $0.00" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.confirmZero).toBe(true);
  });

  it("rejects a negative amount", async () => {
    globalThis.fetch = mockFetchOnce(400, { error: "Negative amounts aren't supported for this expense type." }) as unknown as typeof fetch;
    render(<InlineAmountEditor expense={makeExpense()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.clear(input);
    await user.type(input, "-50");
    await user.click(screen.getByRole("button", { name: "Save amount" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/negative/i);
  });

  it("reverts to the parsed amount after confirmation", async () => {
    const onSaved = vi.fn();
    globalThis.fetch = mockFetchOnce(200, { expense: makeExpense() }) as unknown as typeof fetch;
    const overridden = makeExpense({ amountManuallyOverridden: true, effectiveAmount: 50, parsedAmount: 100 });

    render(<InlineAmountEditor expense={overridden} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: /CA\$50/i }));
    await user.click(screen.getByRole("button", { name: "Revert to parsed amount" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({ revert: true, source: "REVERT" });
  });

  it("does not revert if the confirmation dialog is dismissed", async () => {
    globalThis.fetch = vi.fn();
    vi.stubGlobal("confirm", vi.fn(() => false));
    const overridden = makeExpense({ amountManuallyOverridden: true, effectiveAmount: 50 });

    render(<InlineAmountEditor expense={overridden} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /CA\$50/i }));
    await user.click(screen.getByRole("button", { name: "Revert to parsed amount" }));

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows a failed-save error and keeps the entered value editable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    render(<InlineAmountEditor expense={makeExpense()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.clear(input);
    await user.type(input, "77.00");
    await user.click(screen.getByRole("button", { name: "Save amount" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/failed to save/i);
    expect(input).toHaveValue("77.00");
  });

  it("prevents duplicate submissions while a save is in flight", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    globalThis.fetch = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<InlineAmountEditor expense={makeExpense()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.clear(input);
    await user.type(input, "50");
    const saveButton = screen.getByRole("button", { name: "Save amount" });
    await user.click(saveButton);
    await user.click(saveButton);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    resolveFetch({ ok: true, status: 200, json: async () => ({ expense: makeExpense({ effectiveAmount: 50 }) }) });
  });

  it("shows a conflict message and offers to reload on a stale-record (409) response", async () => {
    const onSaved = vi.fn();
    globalThis.fetch = mockFetchOnce(409, { error: "This expense was changed elsewhere." }) as unknown as typeof fetch;
    render(<InlineAmountEditor expense={makeExpense()} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: /CA\$100/i }));
    const input = screen.getByLabelText(/edit amount/i);
    await user.clear(input);
    await user.type(input, "50");
    await user.click(screen.getByRole("button", { name: "Save amount" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/changed elsewhere/i);
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows a visual, non-color-only indicator when the amount is manually overridden", () => {
    const overridden = makeExpense({ amountManuallyOverridden: true, effectiveAmount: 50, parsedAmount: 100 });
    render(<InlineAmountEditor expense={overridden} onSaved={vi.fn()} />);
    expect(screen.getByText("edited")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manually corrected/i })).toBeInTheDocument();
  });
});
