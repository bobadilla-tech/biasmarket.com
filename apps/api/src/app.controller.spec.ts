import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { AppController } from './app.controller.js';

vi.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('redirects to WEB_URL', () => {
      expect(appController.root()).toEqual({
        url: 'http://localhost:3001',
        statusCode: 302,
      });
    });
  });
});
