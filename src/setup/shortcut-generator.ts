/**
 * shortcut-generator.ts
 *
 * Builds a binary Apple Property List (.shortcut) file with the user's
 * smsApiKey and serverUrl already embedded.
 *
 * The shortcut is meant to be run by a Personal Automation ("When I get a
 * message"), which hands the message to the shortcut as "Shortcut Input".
 * It then POSTs JSON to `serverUrl/api/sms`:
 *   Authorization: Bearer <smsApiKey>
 *   Content-Type:  application/json
 *   Body:          { "sms_body": <message text>, "sender": <sender> }
 * (received_at is left out on purpose; the server stamps the request time.)
 *
 * IMPORTANT LIMITS
 *  - A .shortcut file cannot create the automation trigger itself. The user
 *    still creates the automation in the Shortcuts app and picks this shortcut.
 *  - iOS 15+ only imports signed shortcut files. bplist-creator output is
 *    unsigned, so sign it first (macOS: `shortcuts sign -i in.shortcut -o out.shortcut`)
 *    or use the manual setup page at /setup/ios, which needs no file at all.
 *  - This has not been tested on a physical device.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bplistCreator = require('bplist-creator') as (input: unknown) => Buffer;

export interface ShortcutOptions {
  smsApiKey: string;
  serverUrl: string; // e.g. "https://your-domain.com"
}

/** A text field whose value is a single property of the Shortcut Input (the message). */
function inputProperty(propertyName: 'Content' | 'Sender') {
  return {
    Value: {
      attachmentsByRange: {
        '{0, 1}': {
          Type: 'ExtensionInput',
          Aggrandizements: [
            { Type: 'WFPropertyVariableAggrandizement', PropertyName: propertyName },
          ],
        },
      },
      string: '￼',
    },
    WFSerializationType: 'WFTextTokenString',
  };
}

function textField(value: string) {
  return {
    Value: { string: value },
    WFSerializationType: 'WFTextTokenString',
  };
}

function dictItem(key: string, value: unknown) {
  return { WFItemType: 0, WFKey: textField(key), WFValue: value };
}

/**
 * Generates the binary .shortcut plist buffer (unsigned, see the notes above).
 */
export function generateShortcut(opts: ShortcutOptions): Buffer {
  const { smsApiKey, serverUrl } = opts;
  const baseUrl = serverUrl.replace(/\/+$/, '');
  const apiEndpoint = `${baseUrl}/api/sms`;

  const headerItems = [
    dictItem('Authorization', textField(`Bearer ${smsApiKey}`)),
    dictItem('Content-Type', textField('application/json')),
  ];
  // localtunnel shows an HTML interstitial to unrecognised clients unless this is set
  if (/\.loca\.lt(\/|$)/.test(baseUrl)) {
    headerItems.push(dictItem('bypass-tunnel-reminder', textField('true')));
  }

  const shortcutPlist = {
    WFWorkflowClientVersion: '1140.10',
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowIcon: {
      WFWorkflowIconStartColor: -1544576001,
      WFWorkflowIconGlyphNumber: 59511,
    },
    WFWorkflowImportQuestions: [],
    WFWorkflowInputContentItemClasses: ['WFStringContentItem', 'WFGenericFileContentItem'],
    WFWorkflowName: 'Sika SMS Forward',
    WFWorkflowTypes: [],
    WFWorkflowActions: [
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
        WFWorkflowActionParameters: {
          WFHTTPMethod: 'POST',
          WFURL: apiEndpoint,
          WFHTTPHeaders: {
            Value: { WFDictionaryFieldValueItems: headerItems },
            WFSerializationType: 'WFDictionaryFieldValue',
          },
          WFHTTPBodyType: 'JSON',
          WFJSONValues: {
            Value: {
              WFDictionaryFieldValueItems: [
                dictItem('sms_body', inputProperty('Content')),
                dictItem('sender', inputProperty('Sender')),
              ],
            },
            WFSerializationType: 'WFDictionaryFieldValue',
          },
        },
      },
    ],
  };

  return bplistCreator(shortcutPlist);
}
