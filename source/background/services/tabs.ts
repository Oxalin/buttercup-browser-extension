import { getExtensionAPI } from "../../shared/extension.js";
import { TabEvent } from "../types.js";

export async function sendTabsMessage(payload: TabEvent, tabIDs: Array<number> | null = null): Promise<void> {
    const browser = getExtensionAPI();
    const targetTabIDs = Array.isArray(tabIDs)
        ? tabIDs
        : (
              await browser.tabs.query({
                  status: "complete"
              })
          ).map((tab) => tab.id);
    await Promise.all(
        targetTabIDs.map(async (tabID) => {
            await browser.tabs.sendMessage(tabID, payload);
        })
    );
}
