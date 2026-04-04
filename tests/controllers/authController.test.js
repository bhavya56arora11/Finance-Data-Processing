import { jest } from '@jest/globals';
import { login } from '../../src/controllers/authController.js';
import * as authService from '../../src/services/authService.js';
import { ValidationError, AuthenticationError } from '../../src/errors/errorTypes.js';

jest.unstable_mockModule('../../src/services/authService.js', () => ({
  login: jest.fn(),
  register: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  getMe: jest.fn(),
}));

describe('Auth Controller - login', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      id: 'req-123',
    };
    res = {
      cookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should validate email and password fields', async () => {
    await login(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
  });

  it('should call authService.login and return tokens on success', async () => {
    req.body = { email: 'test@test.com', password: 'Password1' };
    
    authService.login = jest.fn().mockResolvedValue({
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
      user: { id: 'u1', email: 'test@example.com', role: 'admin' },
    });

    await login(req, res, next);

    expect(authService.login).toHaveBeenCalledWith({
      email: 'test@test.com',
      password: 'Password1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      requestId: 'req-123',
    });

    expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'refresh-456', expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        accessToken: 'access-123',
        user: expect.objectContaining({ id: 'u1' })
      })
    }));
  });
});
