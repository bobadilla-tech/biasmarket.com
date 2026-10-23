import { type ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function mockHost(url: string) {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const request = { method: 'GET', url };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, request, response };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AllExceptionsFilter', () => {
  it('maps an unknown exception to a 500 with the request path and an ISO-8601 timestamp, and logs it', () => {
    const filter = new AllExceptionsFilter();
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const { host, request, response } = mockHost('/api/stores/store-1');

    filter.catch(new Error('boom'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal Server Error',
      path: request.url,
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    });
    expect(loggerError).toHaveBeenCalledWith(
      `Unhandled exception on ${request.method} ${request.url}`,
      expect.stringContaining('boom'),
    );
  });

  it('passes HttpException status/message through and does not log unhandled', () => {
    const filter = new AllExceptionsFilter();
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const { host, request, response } = mockHost('/api/stores/store-1');

    filter.catch(new NotFoundException('nope'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'nope',
      path: request.url,
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('does not log a public-order token or a query string', () => {
    const filter = new AllExceptionsFilter();
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const { host, response } = mockHost(
      '/api/public/orders/sekret-token?token=also-secret',
    );

    filter.catch(new Error('boom'), host);

    const logged = String(loggerError.mock.calls[0]?.[0]);
    expect(logged).toContain('/api/public/orders/:token');
    expect(logged).not.toContain('sekret-token');
    expect(logged).not.toContain('also-secret');
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/public/orders/:token' }),
    );
  });
});
