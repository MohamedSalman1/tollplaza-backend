import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { IngestCrossingsDto } from './dto/ingest-crossings.dto';

/**
 * Machine-to-machine: the camera service pushes crossings here with an
 * x-api-key header (StaticApiKeyMiddleware), not a user JWT.
 */
@Controller({ path: 'ingest', version: '1' })
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  /**
   * POST /ingest/crossings
   * Stores up to INGEST.max_batch crossings for one plaza. Re-sending a
   * record that is already stored is safe and counted as a duplicate.
   */
  @Post('crossings')
  @HttpCode(HttpStatus.OK)
  async ingestCrossings(@Body() ingestCrossingsDto: IngestCrossingsDto) {
    const result = await this.ingestService.ingestCrossings(ingestCrossingsDto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Crossings ingested',
      ...result,
    };
  }
}
