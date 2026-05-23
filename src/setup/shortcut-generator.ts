/**
 * shortcut-generator.ts
 *
 * Builds a binary Apple Property List (.shortcut) file with the user's
 * smsApiKey and serverUrl already embedded. When the iPhone opens this file,
 * Shortcuts shows a ready-to-add shortcut — the user just taps "Add Shortcut."
 *
 * The shortcut sends a POST to `serverUrl/api/sms` with:
 *   Authorization: Bearer <smsApiKey>
 *   Content-Type:  application/json
 *   Body:          { sms_body, sender, received_at }
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bplistCreator = require('bplist-creator') as (input: unknown) => Buffer;

export interface ShortcutOptions {
  smsApiKey: string;
  serverUrl: string; // e.g. "https://your-domain.com"
}

// ─── Apple Shortcuts WFWorkflow action UUIDs ─────────────────────────────────
// These UUIDs and identifiers are fixed constants in the Shortcuts file format.
const UUID = {
  action1: 'E0B43822-9B3E-4D68-8D77-D3B2143AA7B0', // Get Latest Messages from Messages
  action2: 'F3E9A543-2B1D-4B3E-9A4C-8D7F6E5C4B3A', // Set Variable: sms_body
  action3: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890', // Get Current Date
  action4: 'B2C3D4E5-F6A7-8901-BCDE-F12345678901', // Format Date
  action5: 'C3D4E5F6-A7B8-9012-CDEF-123456789012', // Get Details of Messages (sender)
  action6: 'D4E5F6A7-B8C9-0123-DEF0-234567890123', // URL
  action7: 'E5F6A7B8-C9D0-1234-EF01-345678901234', // Get Contents of URL (HTTP POST)
};

/**
 * Generates the binary .shortcut plist buffer.
 *
 * The resulting structure is a valid Apple Shortcuts workflow that:
 * 1. Reads the most-recent SMS from the Messages app
 * 2. Posts it to the Sika server with the pre-filled API key and URL
 */
export function generateShortcut(opts: ShortcutOptions): Buffer {
  const { smsApiKey, serverUrl } = opts;
  const apiEndpoint = `${serverUrl.replace(/\/$/, '')}/api/sms`;

  /**
   * Apple Shortcuts binary plist structure.
   *
   * The top-level object matches the schema Apple expects when importing a
   * .shortcut file. WFWorkflowActions contains the action graph.
   *
   * We use a "Get Contents of URL" action (WFGetURLAction) which gives us
   * full control over method, headers, and body — exactly what we need.
   */
  const shortcutPlist = {
    WFWorkflowClientVersion: '1140.10',
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowIcon: {
      WFWorkflowIconStartColor: -1544576001, // Sika orange-ish
      WFWorkflowIconGlyphNumber: 59511,
    },
    WFWorkflowImportQuestions: [],
    WFWorkflowInputContentItemClasses: ['WFSMSContentItem'],
    WFWorkflowName: 'Sika SMS Forward',
    WFWorkflowTypes: ['WFSiriShortcutWorkflow'],
    WFWorkflowActions: [
      // ── Action 1: Get latest message ────────────────────────────────────────
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.getlatestmessages',
        WFWorkflowActionParameters: {
          WFGetLatestMessagesActionCount: 1,
          UUID: UUID.action1,
        },
      },
      // ── Action 2: Repeat with each message ─────────────────────────────────
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.repeat.each',
        WFWorkflowActionParameters: {
          UUID: UUID.action2,
          WFInput: {
            Value: {
              attachmentsByRange: {
                '{0, 1}': {
                  Aggrandizements: [],
                  OutputName: 'Get Latest Messages',
                  OutputUUID: UUID.action1,
                  Type: 'ActionOutput',
                },
              },
              string: '￼',
            },
            WFSerializationType: 'WFTextTokenString',
          },
        },
      },
      // ── Action 3: Get message body ─────────────────────────────────────────
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.properties.messages',
        WFWorkflowActionParameters: {
          UUID: UUID.action3,
          WFContentItemPropertyName: 'Body',
          WFInput: {
            Value: {
              attachmentsByRange: {
                '{0, 1}': {
                  Aggrandizements: [],
                  OutputName: 'Repeat Item',
                  Type: 'ActionOutput',
                },
              },
              string: '￼',
            },
            WFSerializationType: 'WFTextTokenString',
          },
        },
      },
      // ── Action 4: Set Variable "sms_body" ──────────────────────────────────
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.setvariable',
        WFWorkflowActionParameters: {
          UUID: UUID.action4,
          WFVariableName: 'sms_body',
          WFInput: {
            Value: {
              attachmentsByRange: {
                '{0, 1}': {
                  Aggrandizements: [],
                  OutputName: 'Body',
                  OutputUUID: UUID.action3,
                  Type: 'ActionOutput',
                },
              },
              string: '￼',
            },
            WFSerializationType: 'WFTextTokenString',
          },
        },
      },
      // ── Action 5: Get sender ───────────────────────────────────────────────
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.properties.messages',
        WFWorkflowActionParameters: {
          UUID: UUID.action5,
          WFContentItemPropertyName: 'Sender',
          WFInput: {
            Value: {
              attachmentsByRange: {
                '{0, 1}': {
                  Aggrandizements: [],
                  OutputName: 'Repeat Item',
                  Type: 'ActionOutput',
                },
              },
              string: '￼',
            },
            WFSerializationType: 'WFTextTokenString',
          },
        },
      },
      // ── Action 6: Get current date ────────────────────────────────────────
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.date',
        WFWorkflowActionParameters: {
          UUID: UUID.action6,
        },
      },
      // ── Action 7: Format date as ISO 8601 ────────────────────────────────
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.format.date',
        WFWorkflowActionParameters: {
          UUID: UUID.action7,
          WFDateFormatStyle: 'Custom',
          WFDateFormat: "yyyy-MM-dd'T'HH:mm:ssZZZZZ",
          WFDate: {
            Value: {
              attachmentsByRange: {
                '{0, 1}': {
                  Aggrandizements: [],
                  OutputName: 'Current Date',
                  OutputUUID: UUID.action6,
                  Type: 'ActionOutput',
                },
              },
              string: '￼',
            },
            WFSerializationType: 'WFTextTokenString',
          },
        },
      },
      // ── Action 8: POST to Sika server (pre-filled) ──────────────────────
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
          WFHTTPMethod: 'POST',
          WFURL: apiEndpoint,             // ← server URL baked in
          WFHTTPHeaders: {
            Value: {
              WFDictionaryFieldValueItems: [
                {
                  WFItemType: 0,
                  WFKey: {
                    Value: { string: 'Authorization' },
                    WFSerializationType: 'WFTextTokenString',
                  },
                  WFValue: {
                    Value: { string: `Bearer ${smsApiKey}` }, // ← API key baked in
                    WFSerializationType: 'WFTextTokenString',
                  },
                },
                {
                  WFItemType: 0,
                  WFKey: {
                    Value: { string: 'Content-Type' },
                    WFSerializationType: 'WFTextTokenString',
                  },
                  WFValue: {
                    Value: { string: 'application/json' },
                    WFSerializationType: 'WFTextTokenString',
                  },
                },
              ],
            },
            WFSerializationType: 'WFDictionaryFieldValue',
          },
          WFRequestVariable: {
            Value: {
              attachmentsByRange: {
                '{0, 1}': {
                  Aggrandizements: [],
                  OutputName: 'sms_body',
                  Type: 'Variable',
                  VariableName: 'sms_body',
                },
                '{3, 1}': {
                  Aggrandizements: [],
                  OutputName: 'Sender',
                  OutputUUID: UUID.action5,
                  Type: 'ActionOutput',
                },
                '{12, 1}': {
                  Aggrandizements: [],
                  OutputName: 'Formatted Date',
                  OutputUUID: UUID.action7,
                  Type: 'ActionOutput',
                },
              },
              string: '{"sms_body":"￼","sender":"￼","received_at":"￼"}',
            },
            WFSerializationType: 'WFTextTokenString',
          },
          WFHTTPBodyType: 'File',
        },
      },
      // ── Action 9: End Repeat ─────────────────────────────────────────────
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.repeat.each.end',
        WFWorkflowActionParameters: {},
      },
    ],
  };

  return bplistCreator(shortcutPlist);
}
