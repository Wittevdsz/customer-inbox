import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/client/lib/format";

/** Runs a change, then reloads the page's data; a failure shows as a toast. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function run(work: () => Promise<unknown>): Promise<boolean> {
    setPending(true);
    try {
      await work();
      await router.invalidate();
      return true;
    } catch (cause) {
      toast.error(errorMessage(cause));
      return false;
    } finally {
      setPending(false);
    }
  }
  return { run, pending };
}
