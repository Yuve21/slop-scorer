"use client";

import * as React from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

/**
 * The ask. One bordered control, not an input floating next to a detached button.
 *
 * This build has no queue behind it, and the honest thing to do about that is say so in the
 * control itself rather than accept an address and drop it. The button therefore goes to the
 * sample receipt that matches what was typed as closely as we can honestly claim, and the
 * description states the limitation in the same 14px as everything else around it.
 */
export function ScanForm() {
  const [value, setValue] = React.useState("");
  const trimmed = value.trim();

  return (
    <Field className="max-w-[560px] gap-3">
      <FieldLabel htmlFor="artifact" className="text-sm text-ink">
        Paste a URL, or drop an image
      </FieldLabel>
      <form
        action="/receipt/4F2A-9C"
        method="get"
        className="contents"
        onSubmit={(event) => {
          if (trimmed.length === 0) event.preventDefault();
        }}
      >
        <InputGroup className="h-auto rounded-sm border-border-control bg-surface-raised">
          <InputGroupInput
            id="artifact"
            name="artifact"
            inputMode="url"
            autoComplete="url"
            placeholder="https://"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="px-4 py-[14px] font-mono text-mono-md text-ink placeholder:text-ink-muted"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              className="h-auto rounded-sm bg-ink-accent px-[22px] py-[10px] text-sm text-ink-accent-fg hover:bg-ink-accent/90"
            >
              Run it
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      <FieldDescription className="max-w-[72ch] text-sm text-ink-muted">
        There is no queue behind this control yet, so it opens a worked example rather than
        scanning what you typed. We would rather tell you that than take an address and do
        nothing with it. The scan above this one is real and runs on every page load.
      </FieldDescription>
    </Field>
  );
}
