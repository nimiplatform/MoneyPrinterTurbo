import type { NimiElectronAppBusinessServices } from '@nimiplatform/kit/shell/electron/main';
import type { ProductionController } from './production-controller.js';
const objectSchema = (properties: Record<string, unknown>, required: string[] = []) =>
  JSON.stringify({ type: 'object', properties, required, additionalProperties: false });
export class HostAutomation {
  private active = true;
  error = '';
  constructor(
    private services: NimiElectronAppBusinessServices,
    private controller: ProductionController,
  ) {
    void this.run();
  }
  private async run() {
    try {
      await this.controller.ready;
      if (!this.active) return;
      await this.services.integration.registerProvider({
        integrationId: 'moneyprinterturbo.production.v1',
        displayName: 'MoneyPrinterTurbo video production',
        skill:
          'Create short videos through this running Host. Use list with cursor/limit for bounded task summaries, create with an exact parameter snapshot, task for details, and asset for bounded chunks of real stage outputs. cancel stops App scheduling and requests cancellation of known jobs. Never replay uncertain requests, assume queued tasks resumed after restart, or submit social uploads through this provider. App settings and AIConfig are managed in the App and Nimi.',
        operations: [
          {
            name: 'create',
            description:
              'Create a short-video batch using a complete MoneyPrinterTurbo parameter snapshot',
            effect: 'write',
            retryPolicy: 'none',
            supportsCancel: false,
            inputSchemaJson: objectSchema(
              { params: { type: 'object', additionalProperties: true } },
              ['params'],
            ),
            outputSchemaJson: objectSchema(
              { taskIds: { type: 'array', items: { type: 'string' } } },
              ['taskIds'],
            ),
          },
          {
            name: 'task',
            description: 'Read task state and real stage asset paths. Detail above 1 MiB fails; use list for a summary and asset for named outputs such as script.txt, subtitle.srt or final.mp4, or open the task in MoneyPrinterTurbo.',
            effect: 'read',
            retryPolicy: 'none',
            supportsCancel: false,
            inputSchemaJson: objectSchema({ id: { type: 'string' } }, ['id']),
            outputSchemaJson: JSON.stringify({ type: 'object', additionalProperties: true }),
          },
          {
            name: 'list',
            description: 'Read up to 50 task summaries; pass nextCursor as cursor for the next page',
            effect: 'read',
            retryPolicy: 'none',
            supportsCancel: false,
            inputSchemaJson: objectSchema({ cursor: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 } }),
            outputSchemaJson: JSON.stringify({ type: 'object', additionalProperties: true }),
          },
          {
            name: 'cancel',
            description: 'Stop App scheduling and request cancellation of known Runtime jobs',
            effect: 'write',
            retryPolicy: 'none',
            supportsCancel: false,
            inputSchemaJson: objectSchema({ id: { type: 'string' } }, ['id']),
            outputSchemaJson: JSON.stringify({ type: 'object', additionalProperties: true }),
          },
          {
            name: 'asset',
            description: 'Read a bounded chunk of a saved task artifact, including the real final video',
            effect: 'read',
            retryPolicy: 'none',
            supportsCancel: false,
            inputSchemaJson: objectSchema({ id: { type: 'string' }, name: { type: 'string' },
              offset: { type: 'integer', minimum: 0 }, length: { type: 'integer', minimum: 1, maximum: 32768 } }, ['id', 'name']),
            outputSchemaJson: JSON.stringify({ type: 'object', required: ['dataBase64', 'nextOffset', 'eof', 'sha256'],
              properties: { dataBase64: { type: 'string' }, nextOffset: { type: 'integer' }, eof: { type: 'boolean' }, sha256: { type: 'string' } } }),
          },
        ],
      });
      while (this.active) {
        const poll = await this.services.integration.pollProvider({ waitMs: 1000 });
        if (!this.active) return;
        for (const call of poll.calls) {
          let result: unknown;
          let errorCode = '';
          let resultJson: string;
          try {
            const input = JSON.parse(call.inputJson);
            if (call.operation === 'create') result = await this.controller.start(input.params);
            else if (call.operation === 'cancel') result = await this.controller.cancel(input.id);
            else if (call.operation === 'asset') result = await this.controller.readArtifact(input.id, input.name, input.offset, input.length);
            else if (call.operation === 'list') result = await this.controller.listTasks(input.cursor, input.limit);
            else if (call.operation === 'task') result = await this.controller.readTask(input.id);
            else throw new Error('Unknown operation');
            resultJson = JSON.stringify(result);
            // Runtime's Integration result limit is 1 MiB of UTF-8, not JS characters.
            if (Buffer.byteLength(resultJson, 'utf8') > 1024 * 1024) {
              // Runtime records this as failed (PROVIDER_FAILED), never completed.
              // Recovery guidance lives in the operation description because failure bodies are discarded.
              errorCode = 'MPT_RESULT_TOO_LARGE';
              resultJson = '{}';
            }
          } catch (e) {
            errorCode = 'MPT_OPERATION_FAILED';
            resultJson = JSON.stringify({ error: (e instanceof Error ? e.message : String(e)).slice(0, 2000) });
          }
          if (!this.active) return;
          try {
            await this.services.integration.completeProvider({ callId: call.callId, resultJson, errorCode });
          } catch (e) {
            // The business action may have completed. Never execute it again to retry delivery.
            // A failed callback must not abandon unrelated calls already delivered in this poll.
            if (this.active) this.error = `Callback ${call.callId}: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
      }
    } catch (e) {
      if (this.active) this.error = e instanceof Error ? e.message : String(e);
    }
  }
  close() {
    this.active = false;
  }
}
