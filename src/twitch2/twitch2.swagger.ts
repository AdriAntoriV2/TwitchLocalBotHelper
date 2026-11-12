import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

export const ApiTwitchControllerDocs = () => applyDecorators(ApiTags('Twitch'));

export const ApiTwitchOAuth = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Start Twitch device authorization',
      description:
        'Starts the connector library device-code flow. Open the returned verification URI, enter the user code, and approve StreamOps. Authorization completes in the background.',
    }),
    ApiResponse({
      status: 200,
      description: 'Device authorization instructions.',
      content: {
        'application/json': {
          example: {
            verificationUri: 'https://www.twitch.tv/activate',
            userCode: 'ABCD-1234',
            expiresIn: 600,
            interval: 5,
          },
        },
      },
    }),
    ApiResponse({
      status: 409,
      description:
        'Device authorization is already in progress or Twitch is connected.',
      content: {
        'application/json': {
          example: {
            statusCode: 409,
            message: 'Twitch device login is already in progress.',
            error: 'Conflict',
          },
        },
      },
    }),
  );

export const ApiTwitchOAuthStatus = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Read Twitch device authorization status',
      description:
        'Returns whether Twitch is connected or device authorization is pending, required, or failed.',
    }),
    ApiResponse({
      status: 200,
      description: 'Current Twitch connection state.',
      content: {
        'application/json': {
          example: {
            status: 'pending',
          },
        },
      },
    }),
  );

export const ApiTwitchLogout = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Disconnect the current session',
      description:
        'Destroys the current session and clears the streamops.sid cookie. This endpoint does not delete the saved Twitch account or revoke its Twitch authorization.',
    }),
    ApiResponse({
      status: 204,
      description:
        'Session destroyed and session cookie cleared. No response body.',
    }),
    ApiResponse({
      status: 500,
      description: 'The session could not be destroyed.',
      content: {
        'application/json': {
          example: {
            statusCode: 500,
            message: 'Internal server error',
          },
        },
      },
    }),
  );