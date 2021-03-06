import {IntegrationTest} from '../IntegrationTest';

import {isEqual} from 'lodash';
import {assert} from './util';
import * as faker from 'faker';
import {
  _getMissedUserInfo,
  sendMessage,
  transferCurrentComplicationUserInfo,
  transferUserInfo,
  watchEvents,
} from 'react-native-watch-connectivity';
import {TestFnOpts} from './index';
import {UnsubscribeFn} from 'react-native-watch-connectivity/events';

export class UserInfoIntegrationTest extends IntegrationTest {
  constructor() {
    super('User Info');
    this.registerTest('Transfer user info', 'reachable', this.testSendUserInfo);
    this.registerTest(
      'Transfer complication user info',
      'reachable',
      this.testTransferComplicationUserInfo,
    );
    this.registerTest(
      'Subscribe to user info',
      'reachable',
      this.testSubscribeToUserInfo,
    );
    this.registerTest('User info queue', 'reachable', this.testUserInfoQueue);
  }

  testSendUserInfo = async (opts: TestFnOpts) => {
    await _getMissedUserInfo();
    const sentUserInfo = {uid: faker.lorem.word(), name: faker.lorem.words(2)};
    const receivedUserInfo = await this.sendUserInfoAndWaitForAck(
      sentUserInfo,
      opts,
    );
    assert(isEqual(sentUserInfo, receivedUserInfo));
  };

  testTransferComplicationUserInfo = async (opts: TestFnOpts) => {
    await _getMissedUserInfo();
    const sentUserInfo = {uid: faker.lorem.word(), name: faker.lorem.words(2)};
    const receivedUserInfo = await this.sendUserInfoAndWaitForAck(
      sentUserInfo,
      opts,
      true,
    );
    assert(isEqual(sentUserInfo, receivedUserInfo));
  };

  testSubscribeToUserInfo = async ({log}: TestFnOpts) => {
    return _getMissedUserInfo().then(
      () =>
        new Promise((resolve, reject) => {
          const expectedUserInfo = {
            uid: 'xyz',
            name: 'bob',
            email: 'bob@example.com',
          };

          watchEvents.once('user-info', (userInfoList) => {
            log(
              'received user info from watch event: ' +
                JSON.stringify(userInfoList),
            );

            assert(userInfoList.length === 1);

            if (!isEqual(userInfoList[0], expectedUserInfo)) {
              reject(new Error('User info did not match'));
            }

            _getMissedUserInfo()
              .then((missed) => {
                log(`${missed.length} missed user info`);
                assert(!missed.length, 'should have dequeued user info');
                resolve();
              })
              .catch(reject);
          });

          sendMessage({test: true, text: 'send me some user info'});
          log('requested user info from watch');
        }),
    );
  };

  testUserInfoQueue = async ({log}: TestFnOpts) => {
    return _getMissedUserInfo().then(async () => {
      let message = {test: true, text: 'send me some user info'};
      log('sent message: ' + JSON.stringify(message));

      await new Promise((resolve) => {
        sendMessage(message, () => {
          resolve();
        });
      });

      message = {test: true, text: 'send me some more user info'};
      log('sent message: ' + JSON.stringify(message));
      await new Promise((resolve) => {
        sendMessage(message, () => {
          resolve();
        });
      });

      let missedUserInfo = await watchEvents.once('user-info');

      log('user info: ' + JSON.stringify(missedUserInfo));

      const firstExpectedUserInfo = {
        uid: 'xyz',
        name: 'bob',
        email: 'bob@example.com',
      };

      const secondExpectedUserInfo = {
        uid: 'abc',
        name: 'mike',
        email: 'mike@example.com',
      };

      assert(
        missedUserInfo.length === 2,
        'should have two queued user records',
      );

      assert(
        isEqual(firstExpectedUserInfo, missedUserInfo[0]),
        'first record should match',
      );

      assert(
        isEqual(secondExpectedUserInfo, missedUserInfo[1]),
        'second record should match',
      );

      missedUserInfo = await _getMissedUserInfo();

      assert(
        missedUserInfo.length === 0,
        'grabbing the missed user info should dequeue it',
      );
    });
  };

  private sendUserInfoAndWaitForAck = (
    userInfoToSend: Record<string, unknown>,
    {log, after}: TestFnOpts,
    complication: boolean = false,
  ) => {
    let unsubscribe: UnsubscribeFn = () => {};

    after(() => unsubscribe());

    return new Promise((resolve, reject) => {
      if (complication) {
        transferCurrentComplicationUserInfo(userInfoToSend);
      } else {
        transferUserInfo(userInfoToSend);
      }

      unsubscribe = watchEvents.addListener('message', (payload) => {
        if (payload) {
          log('Received message: ' + JSON.stringify(payload));
        }
        if (payload?.text === 'user info received by the watch') {
          const userInfo = payload && payload['user-info'];
          if (typeof userInfo === 'object') {
            resolve(userInfo);
          } else {
            reject(new Error('Invalid payload'));
          }
        }
      });

      log('sent user info: ' + JSON.stringify(userInfoToSend));
      log('waiting for acknowledgement from watch');
    });
  };
}
