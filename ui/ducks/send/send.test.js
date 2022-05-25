import sinon from 'sinon';
import createMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESS_ERROR,
  INSUFFICIENT_FUNDS_ERROR,
  INSUFFICIENT_TOKENS_ERROR,
  INVALID_RECIPIENT_ADDRESS_ERROR,
  KNOWN_RECIPIENT_ADDRESS_WARNING,
  NEGATIVE_ETH_ERROR,
} from '../../pages/send/send.constants';
import {
  MAINNET_CHAIN_ID,
  RINKEBY_CHAIN_ID,
} from '../../../shared/constants/network';
import { GAS_ESTIMATE_TYPES, GAS_LIMITS } from '../../../shared/constants/gas';
import {
  ASSET_TYPES,
  TRANSACTION_ENVELOPE_TYPES,
  TRANSACTION_TYPES,
} from '../../../shared/constants/transaction';
import * as Actions from '../../store/actions';
import { setBackgroundConnection } from '../../../test/jest';
import { generateERC20TransferData } from '../../pages/send/send.utils';
import sendReducer, {
  initialState,
  draftTransactionInitialState,
  initializeSendState,
  updateSendAmount,
  updateSendAsset,
  updateRecipientUserInput,
  useContactListForRecipientSearch,
  useMyAccountsForRecipientSearch,
  updateRecipient,
  resetRecipientInput,
  updateSendHexData,
  toggleSendMaxMode,
  signTransaction,
  SEND_STATUSES,
  SEND_STAGES,
  AMOUNT_MODES,
  RECIPIENT_SEARCH_MODES,
  editTransaction,
  getGasLimit,
  getGasPrice,
  getGasTotal,
  gasFeeIsInError,
  getMinimumGasLimitForSend,
  getGasInputMode,
  GAS_INPUT_MODES,
  getSendAsset,
  getSendAssetAddress,
  getIsAssetSendable,
  getSendAmount,
  getIsBalanceInsufficient,
  getSendMaxModeState,
  getDraftTransactionID,
  sendAmountIsInError,
  getSendHexData,
  getSendTo,
  getIsUsingMyAccountForRecipientSearch,
  getRecipientUserInput,
  getRecipient,
  getSendErrors,
  isSendStateInitialized,
  isSendFormInvalid,
  getSendStage,
  updateGasPrice,
} from './send';
import { editExistingTransaction } from '.';

const mockStore = createMockStore([thunk]);

const INITIAL_TEST_STATE_FOR_EXISTING_DRAFT = {
  ...initialState,
  currentTransactionUUID: 'test-uuid',
  draftTransactions: {
    'test-uuid': {
      ...draftTransactionInitialState,
    },
  },
};

const getInitialStateWithExistingTxState = (draftTxState) => ({
  ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
  draftTransactions: {
    'test-uuid': {
      ...draftTransactionInitialState,
      ...draftTxState,
      amount: {
        ...draftTransactionInitialState.amount,
        ...draftTxState.amount,
      },
      asset: {
        ...draftTransactionInitialState.asset,
        ...draftTxState.asset,
      },
      gas: {
        ...draftTransactionInitialState.gas,
        ...draftTxState.gas,
      },
      recipient: {
        ...draftTransactionInitialState.recipient,
        ...draftTxState.recipient,
      },
      history: draftTxState.history ?? [],
      test: 'yo',
    },
  },
});

jest.mock('./send', () => {
  const actual = jest.requireActual('./send');
  return {
    __esModule: true,
    ...actual,
    getERC20Balance: jest.fn(() => '0x0'),
  };
});

setBackgroundConnection({
  addPollingTokenToAppState: jest.fn(),
  addUnapprovedTransaction: jest.fn((_w, _x, _y, _z, cb) => {
    cb(null);
  }),
  updateTransactionSendFlowHistory: jest.fn((_x, _y, cb) => cb(null)),
});

const getTestUUIDTx = (state) => state.draftTransactions['test-uuid'];

describe('Send Slice', () => {
  let getTokenStandardAndDetailsStub;
  beforeEach(() => {
    jest.useFakeTimers();
    getTokenStandardAndDetailsStub = jest
      .spyOn(Actions, 'getTokenStandardAndDetails')
      .mockImplementation(() =>
        Promise.resolve({ standard: 'ERC20', balance: '0x0' }),
      );
    jest
      .spyOn(Actions, 'estimateGas')
      .mockImplementation(() => Promise.resolve('0x0'));
    jest
      .spyOn(Actions, 'getGasFeeEstimatesAndStartPolling')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(Actions, 'updateTokenType')
      .mockImplementation(() => Promise.resolve({ isERC721: false }));
    jest
      .spyOn(Actions, 'isCollectibleOwner')
      .mockImplementation(() => Promise.resolve(true));
    jest.spyOn(Actions, 'updateEditableParams').mockImplementation(() => ({
      type: 'UPDATE_TRANSACTION_EDITABLE_PARAMS',
    }));
    jest
      .spyOn(Actions, 'updateTransactionGasFees')
      .mockImplementation(() => ({ type: 'UPDATE_TRANSACTION_GAS_FEES' }));
  });

  describe('Reducers', () => {
    describe('updateSendAmount', () => {
      it('should', async () => {
        const action = { type: 'send/updateSendAmount', payload: '0x1' };
        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );
        expect(getTestUUIDTx(result).amount.value).toStrictEqual('0x1');
      });
    });

    describe('updateAmountToMax', () => {
      it('should calculate the max amount based off of the asset balance and gas total then updates send amount value', () => {
        const maxAmountState = {
          amount: {
            value: '',
          },
          asset: {
            balance: '0x56bc75e2d63100000', // 100000000000000000000
          },
          gas: {
            gasLimit: GAS_LIMITS.SIMPLE, // 21000
            gasTotal: '0x1319718a5000', // 21000000000000
            minimumGasLimit: GAS_LIMITS.SIMPLE,
          },
        };

        const state = getInitialStateWithExistingTxState(maxAmountState);
        const action = { type: 'send/updateAmountToMax' };
        const result = sendReducer(state, action);

        expect(getTestUUIDTx(result).amount.value).toStrictEqual(
          '0x56bc74b13f185b000',
        ); // 99999979000000000000
      });
    });

    describe('updateGasFees', () => {
      it('should work with FEE_MARKET gas fees', () => {
        const action = {
          type: 'send/updateGasFees',
          payload: {
            transactionType: TRANSACTION_ENVELOPE_TYPES.FEE_MARKET,
            maxFeePerGas: '0x2',
            maxPriorityFeePerGas: '0x1',
          },
        };
        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.gas.maxFeePerGas).toStrictEqual(
          action.payload.maxFeePerGas,
        );

        expect(draftTransaction.gas.maxPriorityFeePerGas).toStrictEqual(
          action.payload.maxPriorityFeePerGas,
        );

        expect(draftTransaction.transactionType).toBe(
          TRANSACTION_ENVELOPE_TYPES.FEE_MARKET,
        );
      });

      it('should work with LEGACY gas fees', () => {
        const action = {
          type: 'send/updateGasFees',
          payload: {
            transactionType: TRANSACTION_ENVELOPE_TYPES.LEGACY,
            gasPrice: '0x1',
          },
        };
        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.gas.gasPrice).toStrictEqual(
          action.payload.gasPrice,
        );
        expect(draftTransaction.transactionType).toBe(
          TRANSACTION_ENVELOPE_TYPES.LEGACY,
        );
      });
    });

    describe('updateUserInputHexData', () => {
      it('should update the state with the provided data', () => {
        const action = {
          type: 'send/updateUserInputHexData',
          payload: 'TestData',
        };
        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );
        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.userInputHexData).toStrictEqual(action.payload);
      });
    });

    describe('updateGasLimit', () => {
      const action = {
        type: 'send/updateGasLimit',
        payload: GAS_LIMITS.SIMPLE, // 21000
      };

      it('should', () => {
        const result = sendReducer(
          {
            ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
            stage: SEND_STAGES.DRAFT,
            isGasEstimateLoading: false,
          },
          action,
        );

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.gas.gasLimit).toStrictEqual(action.payload);
      });

      it('should recalculate gasTotal', () => {
        const gasState = getInitialStateWithExistingTxState({
          gas: {
            gasLimit: '0x0',
            gasPrice: '0x3b9aca00', // 1000000000
          },
        });

        const result = sendReducer(gasState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.gas.gasLimit).toStrictEqual(action.payload);
        expect(draftTransaction.gas.gasPrice).toStrictEqual('0x3b9aca00');
        expect(draftTransaction.gas.gasTotal).toStrictEqual('0x1319718a5000'); // 21000000000000
      });
    });

    describe('updateAmountMode', () => {
      it('should change to INPUT amount mode', () => {
        const emptyAmountModeState = {
          amountMode: '',
        };

        const action = {
          type: 'send/updateAmountMode',
          payload: AMOUNT_MODES.INPUT,
        };
        const result = sendReducer(emptyAmountModeState, action);

        expect(result.amountMode).toStrictEqual(action.payload);
      });

      it('should change to MAX amount mode', () => {
        const action = {
          type: 'send/updateAmountMode',
          payload: AMOUNT_MODES.MAX,
        };
        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        expect(result.amountMode).toStrictEqual(action.payload);
      });

      it('should', () => {
        const action = {
          type: 'send/updateAmountMode',
          payload: 'RANDOM',
        };
        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        expect(result.amountMode).not.toStrictEqual(action.payload);
      });
    });

    describe('updateAsset', () => {
      it('should update asset type and balance from respective action payload', () => {
        const updateAssetState = getInitialStateWithExistingTxState({
          asset: {
            type: 'old type',
            balance: 'old balance',
          },
        });

        const action = {
          type: 'send/updateAsset',
          payload: {
            type: 'new type',
            balance: 'new balance',
          },
        };

        const result = sendReducer(updateAssetState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.asset.type).toStrictEqual(action.payload.type);
        expect(draftTransaction.asset.balance).toStrictEqual(
          action.payload.balance,
        );
      });

      it('should nullify old contract address error when asset types is not TOKEN', () => {
        const recipientErrorState = getInitialStateWithExistingTxState({
          recipient: {
            error: CONTRACT_ADDRESS_ERROR,
          },
          asset: {
            type: ASSET_TYPES.TOKEN,
          },
        });

        const action = {
          type: 'send/updateAsset',
          payload: {
            type: 'New Type',
          },
        };

        const result = sendReducer(recipientErrorState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.recipient.error).not.toStrictEqual(
          CONTRACT_ADDRESS_ERROR,
        );
        expect(draftTransaction.recipient.error).toBeNull();
      });

      it('should nullify old known address error when asset types is not TOKEN', () => {
        const recipientErrorState = getInitialStateWithExistingTxState({
          recipient: {
            warning: KNOWN_RECIPIENT_ADDRESS_WARNING,
          },
          asset: {
            type: ASSET_TYPES.TOKEN,
          },
        });

        const action = {
          type: 'send/updateAsset',
          payload: {
            type: 'New Type',
          },
        };

        const result = sendReducer(recipientErrorState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.recipient.warning).not.toStrictEqual(
          KNOWN_RECIPIENT_ADDRESS_WARNING,
        );
        expect(draftTransaction.recipient.warning).toBeNull();
      });

      it('should update asset type and details to TOKEN payload', () => {
        const action = {
          type: 'send/updateAsset',
          payload: {
            type: ASSET_TYPES.TOKEN,
            details: {
              address: '0xTokenAddress',
              decimals: 0,
              symbol: 'TKN',
            },
          },
        };

        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.asset.type).toStrictEqual(action.payload.type);
        expect(draftTransaction.asset.details).toStrictEqual(
          action.payload.details,
        );
      });
    });

    describe('updateRecipient', () => {
      it('should', () => {
        const action = {
          type: 'send/updateRecipient',
          payload: {
            address: '0xNewAddress',
          },
        };

        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        const draftTransaction = getTestUUIDTx(result);

        expect(result.stage).toStrictEqual(SEND_STAGES.DRAFT);
        expect(draftTransaction.recipient.address).toStrictEqual(
          action.payload.address,
        );
      });
    });

    describe('useDefaultGas', () => {
      it('should', () => {
        const action = {
          type: 'send/useDefaultGas',
        };

        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        expect(result.isCustomGasSet).toStrictEqual(false);
      });
    });

    describe('useCustomGas', () => {
      it('should', () => {
        const action = {
          type: 'send/useCustomGas',
        };

        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        expect(result.isCustomGasSet).toStrictEqual(true);
      });
    });

    describe('updateRecipientUserInput', () => {
      it('should update recipient user input with payload', () => {
        const action = {
          type: 'send/updateRecipientUserInput',
          payload: 'user input',
        };

        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        expect(result.recipientInput).toStrictEqual(action.payload);
      });
    });

    describe('validateRecipientUserInput', () => {
      it('should set recipient error and warning to null when user input is', () => {
        const noUserInputState = {
          ...getInitialStateWithExistingTxState({
            recipient: {
              error: 'someError',
              warning: 'someWarning',
            },
          }),
          recipientInput: '',
          recipientMode: RECIPIENT_SEARCH_MODES.MY_ACCOUNTS,
        };

        const action = {
          type: 'send/validateRecipientUserInput',
        };

        const result = sendReducer(noUserInputState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.recipient.error).toBeNull();
        expect(draftTransaction.recipient.warning).toBeNull();
      });

      it('should error with an invalid address error when user input is not a valid hex string', () => {
        const tokenAssetTypeState = {
          ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          recipientInput: '0xValidateError',
        };
        const action = {
          type: 'send/validateRecipientUserInput',
          payload: {
            chainId: '',
            tokens: [],
            useTokenDetection: true,
            tokenAddressList: [],
          },
        };

        const result = sendReducer(tokenAssetTypeState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.recipient.error).toStrictEqual(
          'invalidAddressRecipient',
        );
      });

      // TODO: Expectation might change in the future
      it('should error with an invalid network error when user input is not a valid hex string on a non default network', () => {
        const tokenAssetTypeState = {
          ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          recipientInput: '0xValidateError',
        };
        const action = {
          type: 'send/validateRecipientUserInput',
          payload: {
            chainId: '0x55',
            tokens: [],
            useTokenDetection: true,
            tokenAddressList: [],
          },
        };

        const result = sendReducer(tokenAssetTypeState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.recipient.error).toStrictEqual(
          'invalidAddressRecipientNotEthNetwork',
        );
      });

      it('should error with invalid address recipient when the user inputs the burn address', () => {
        const tokenAssetTypeState = {
          ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          recipientInput: '0x0000000000000000000000000000000000000000',
        };
        const action = {
          type: 'send/validateRecipientUserInput',
          payload: {
            chainId: '',
            tokens: [],
            useTokenDetection: true,
            tokenAddressList: [],
          },
        };

        const result = sendReducer(tokenAssetTypeState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.recipient.error).toStrictEqual(
          'invalidAddressRecipient',
        );
      });

      it('should error with same address recipient as a token', () => {
        const tokenAssetTypeState = {
          ...getInitialStateWithExistingTxState({
            asset: {
              type: ASSET_TYPES.TOKEN,
              details: {
                address: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
              },
            },
          }),
          recipientInput: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
        };

        const action = {
          type: 'send/validateRecipientUserInput',
          payload: {
            chainId: '0x4',
            tokens: [],
            useTokenDetection: true,
            tokenAddressList: ['0x514910771af9ca656af840dff83e8264ecf986ca'],
          },
        };

        const result = sendReducer(tokenAssetTypeState, action);
        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.recipient.error).toStrictEqual(
          'contractAddressError',
        );
      });
    });

    describe('updateRecipientSearchMode', () => {
      it('should', () => {
        const action = {
          type: 'send/updateRecipientSearchMode',
          payload: 'a-random-string',
        };

        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        expect(result.recipientMode).toStrictEqual(action.payload);
      });
    });

    describe('resetSendState', () => {
      it('should', () => {
        const action = {
          type: 'send/resetSendState',
        };

        const result = sendReducer({}, action);

        expect(result).toStrictEqual(initialState);
      });
    });

    describe('validateAmountField', () => {
      it('should error with insufficient funds when amount asset value plust gas is higher than asset balance', () => {
        const nativeAssetState = getInitialStateWithExistingTxState({
          amount: {
            value: '0x6fc23ac0', // 1875000000
          },
          asset: {
            type: ASSET_TYPES.NATIVE,
            balance: '0x77359400', // 2000000000
          },
          gas: {
            gasTotal: '0x8f0d180', // 150000000
          },
        });

        const action = {
          type: 'send/validateAmountField',
        };

        const result = sendReducer(nativeAssetState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.amount.error).toStrictEqual(
          INSUFFICIENT_FUNDS_ERROR,
        );
      });

      it('should error with insufficient tokens when amount value of tokens is higher than asset balance of token', () => {
        const tokenAssetState = getInitialStateWithExistingTxState({
          amount: {
            value: '0x77359400', // 2000000000
          },
          asset: {
            type: ASSET_TYPES.TOKEN,
            balance: '0x6fc23ac0', // 1875000000
            details: {
              decimals: 0,
            },
          },
        });

        const action = {
          type: 'send/validateAmountField',
        };

        const result = sendReducer(tokenAssetState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.amount.error).toStrictEqual(
          INSUFFICIENT_TOKENS_ERROR,
        );
      });

      it('should error negative value amount', () => {
        const negativeAmountState = getInitialStateWithExistingTxState({
          amount: {
            value: '-1',
          },
        });

        const action = {
          type: 'send/validateAmountField',
        };

        const result = sendReducer(negativeAmountState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.amount.error).toStrictEqual(NEGATIVE_ETH_ERROR);
      });

      it('should not error for positive value amount', () => {
        const otherState = getInitialStateWithExistingTxState({
          amount: {
            error: 'someError',
            value: '1',
          },
          asset: {
            type: '',
          },
        });

        const action = {
          type: 'send/validateAmountField',
        };

        const result = sendReducer(otherState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.amount.error).toBeNull();
      });
    });

    describe('validateGasField', () => {
      it('should error when total amount of gas is higher than account balance', () => {
        const gasFieldState = getInitialStateWithExistingTxState({
          account: {
            balance: '0x0',
          },
          gas: {
            gasTotal: '0x1319718a5000', // 21000000000000
          },
        });

        const action = {
          type: 'send/validateGasField',
        };

        const result = sendReducer(gasFieldState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.gas.error).toStrictEqual(
          INSUFFICIENT_FUNDS_ERROR,
        );
      });
    });

    describe('validateSendState', () => {
      it('should set `INVALID` send state status when amount error is present', () => {
        const amountErrorState = getInitialStateWithExistingTxState({
          amount: {
            error: 'Some Amount Error',
          },
        });

        const action = {
          type: 'send/validateSendState',
        };

        const result = sendReducer(amountErrorState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.status).toStrictEqual(SEND_STATUSES.INVALID);
      });

      it('should set `INVALID` send state status when gas error is present', () => {
        const gasErrorState = getInitialStateWithExistingTxState({
          gas: {
            error: 'Some Amount Error',
          },
        });

        const action = {
          type: 'send/validateSendState',
        };

        const result = sendReducer(gasErrorState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.status).toStrictEqual(SEND_STATUSES.INVALID);
      });

      it('should set `INVALID` send state status when asset type is `TOKEN` without token details present', () => {
        const assetErrorState = getInitialStateWithExistingTxState({
          asset: {
            type: ASSET_TYPES.TOKEN,
          },
        });

        const action = {
          type: 'send/validateSendState',
        };

        const result = sendReducer(assetErrorState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.status).toStrictEqual(SEND_STATUSES.INVALID);
      });

      it('should set `INVALID` send state status when gasLimit is under the minimumGasLimit', () => {
        const gasLimitErroState = getInitialStateWithExistingTxState({
          gas: {
            gasLimit: '0x5207',
            minimumGasLimit: GAS_LIMITS.SIMPLE,
          },
        });

        const action = {
          type: 'send/validateSendState',
        };

        const result = sendReducer(gasLimitErroState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.status).toStrictEqual(SEND_STATUSES.INVALID);
      });

      it('should set `VALID` send state status when conditionals have not been met', () => {
        const validSendStatusState = {
          ...getInitialStateWithExistingTxState({
            asset: {
              type: ASSET_TYPES.TOKEN,
              details: {
                address: '0x000',
              },
            },
            gas: {
              gasLimit: GAS_LIMITS.SIMPLE,
            },
          }),
          stage: SEND_STAGES.DRAFT,
          isGasEstimateLoading: false,
          minimumGasLimit: GAS_LIMITS.SIMPLE,
        };

        const action = {
          type: 'send/validateSendState',
        };

        const result = sendReducer(validSendStatusState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.status).toStrictEqual(SEND_STATUSES.VALID);
      });
    });
  });

  describe('extraReducers/externalReducers', () => {
    describe('QR Code Detected', () => {
      const qrCodestate = getInitialStateWithExistingTxState({
        recipient: {
          address: '0xAddress',
        },
      });

      it('should set the recipient address to the scanned address value if they are not equal', () => {
        const action = {
          type: 'UI_QR_CODE_DETECTED',
          value: {
            type: 'address',
            values: {
              address: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
            },
          },
        };

        const result = sendReducer(qrCodestate, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.recipient.address).toStrictEqual(
          action.value.values.address,
        );
      });

      it('should not set the recipient address to invalid scanned address and errors', () => {
        const badQRAddressAction = {
          type: 'UI_QR_CODE_DETECTED',
          value: {
            type: 'address',
            values: {
              address: '0xBadAddress',
            },
          },
        };

        const result = sendReducer(qrCodestate, badQRAddressAction);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.recipient.address).toStrictEqual('0xAddress');
        expect(draftTransaction.recipient.error).toStrictEqual(
          INVALID_RECIPIENT_ADDRESS_ERROR,
        );
      });
    });

    describe('Selected Address Changed', () => {
      it('should update selected account address and balance on non-edit stages', () => {
        const olderState = {
          ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          nativeBalance: '0x0',
          accountAddress: '0xAddress',
        };

        const action = {
          type: 'SELECTED_ACCOUNT_CHANGED',
          payload: {
            account: {
              address: '0xDifferentAddress',
              balance: '0x1',
            },
          },
        };

        const result = sendReducer(olderState, action);

        expect(result.nativeBalance).toStrictEqual(
          action.payload.account.balance,
        );
        expect(result.accountAddress).toStrictEqual(
          action.payload.account.address,
        );
      });
    });

    describe('Account Changed', () => {
      it('should', () => {
        const accountsChangedState = {
          ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          stage: SEND_STAGES.EDIT,
          accountAddress: '0xAddress',
          nativeBalance: '0x0',
        };

        const action = {
          type: 'ACCOUNT_CHANGED',
          payload: {
            account: {
              address: '0xAddress',
              balance: '0x1',
            },
          },
        };

        const result = sendReducer(accountsChangedState, action);

        expect(result.nativeBalance).toStrictEqual(
          action.payload.account.balance,
        );
      });

      it(`should not edit account balance if action payload address is not the same as state's address`, () => {
        const accountsChangedState = {
          ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          stage: SEND_STAGES.EDIT,
          accountAddress: '0xAddress',
          nativeBalance: '0x0',
        };

        const action = {
          type: 'ACCOUNT_CHANGED',
          payload: {
            account: {
              address: '0xDifferentAddress',
              balance: '0x1',
            },
          },
        };

        const result = sendReducer(accountsChangedState, action);
        expect(result.accountAddress).not.toStrictEqual(
          action.payload.account.address,
        );
        expect(result.nativeBalance).not.toStrictEqual(
          action.payload.account.balance,
        );
      });
    });

    describe('Initialize Pending Send State', () => {
      let dispatchSpy;
      let getState;

      beforeEach(() => {
        dispatchSpy = jest.fn();
      });

      it('should dispatch async action thunk first with pending, then finally fulfilling from minimal state', async () => {
        getState = jest.fn().mockReturnValue({
          metamask: {
            gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
            gasFeeEstimates: {},
            networkDetails: {
              EIPS: {
                1559: true,
              },
            },
            selectedAddress: '0xAddress',
            identities: { '0xAddress': { address: '0xAddress' } },
            keyrings: [
              {
                type: 'HD Key Tree',
                accounts: ['0xAddress'],
              },
            ],
            accounts: {
              '0xAddress': {
                address: '0xAddress',
                balance: '0x0',
              },
            },
            cachedBalances: {
              0x4: {
                '0xAddress': '0x0',
              },
            },
            provider: {
              chainId: '0x4',
            },
            useTokenDetection: true,
            tokenList: {
              0x514910771af9ca656af840dff83e8264ecf986ca: {
                address: '0x514910771af9ca656af840dff83e8264ecf986ca',
                symbol: 'LINK',
                decimals: 18,
                name: 'Chainlink',
                iconUrl:
                  'https://s3.amazonaws.com/airswap-token-images/LINK.png',
                aggregators: [
                  'airswapLight',
                  'bancor',
                  'cmc',
                  'coinGecko',
                  'kleros',
                  'oneInch',
                  'paraswap',
                  'pmm',
                  'totle',
                  'zapper',
                  'zerion',
                  'zeroEx',
                ],
                occurrences: 12,
              },
            },
          },
          send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          gas: {
            basicEstimateStatus: 'LOADING',
            basicEstimatesStatus: {
              safeLow: null,
              average: null,
              fast: null,
            },
          },
        });

        const action = initializeSendState();
        await action(dispatchSpy, getState, undefined);

        expect(dispatchSpy).toHaveBeenCalledTimes(3);

        expect(dispatchSpy.mock.calls[0][0].type).toStrictEqual(
          'send/initializeSendState/pending',
        );
        expect(dispatchSpy.mock.calls[2][0].type).toStrictEqual(
          'send/initializeSendState/fulfilled',
        );
      });
    });

    describe('Set Basic Gas Estimate Data', () => {
      it('should recalculate gas based off of average basic estimate data', () => {
        const gasState = {
          ...getInitialStateWithExistingTxState({
            gas: {
              gasPrice: '0x0',
              gasLimit: GAS_LIMITS.SIMPLE,
              gasTotal: '0x0',
            },
          }),
          minimumGasLimit: GAS_LIMITS.SIMPLE,
          gasPriceEstimate: '0x0',
        };

        const action = {
          type: 'GAS_FEE_ESTIMATES_UPDATED',
          payload: {
            gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
            gasFeeEstimates: {
              medium: '1',
            },
          },
        };

        const result = sendReducer(gasState, action);

        const draftTransaction = getTestUUIDTx(result);

        expect(draftTransaction.gas.gasPrice).toStrictEqual('0x3b9aca00'); // 1000000000
        expect(draftTransaction.gas.gasLimit).toStrictEqual(GAS_LIMITS.SIMPLE);
        expect(draftTransaction.gas.gasTotal).toStrictEqual('0x1319718a5000');
      });
    });
  });

  describe('Action Creators', () => {
    describe('updateGasPrice', () => {
      it('should update gas price and update draft transaction with validated state', async () => {
        const store = mockStore({
          send: getInitialStateWithExistingTxState({
            gas: {
              gasPrice: undefined,
            },
          }),
        });

        const newGasPrice = '0x0';

        await store.dispatch(updateGasPrice(newGasPrice));

        const actionResult = store.getActions();

        const expectedActionResult = [
          {
            type: 'send/addHistoryEntry',
            payload: 'sendFlow - user set legacy gasPrice to 0x0',
          },
          {
            type: 'send/updateGasFees',
            payload: {
              gasPrice: '0x0',
              transactionType: TRANSACTION_ENVELOPE_TYPES.LEGACY,
            },
          },
        ];

        expect(actionResult).toStrictEqual(expectedActionResult);
      });
    });

    describe('UpdateSendAmount', () => {
      it('should create an action to update send amount', async () => {
        const sendState = {
          metamask: {
            blockGasLimit: '',
            selectedAddress: '',
            provider: {
              chainId: '0x1',
            },
          },
          send: getInitialStateWithExistingTxState({
            asset: {
              details: {},
            },
            gas: {
              gasPrice: '',
            },
            recipient: {
              address: '',
            },
            amount: {
              value: '',
            },
            userInputHexData: '',
          }),
        };
        const store = mockStore(sendState);

        const newSendAmount = 'DE0B6B3A7640000';

        await store.dispatch(updateSendAmount(newSendAmount));

        const actionResult = store.getActions();

        const expectedFirstActionResult = {
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user set amount to 1 ETH',
        };

        const expectedSecondActionResult = {
          type: 'send/updateSendAmount',
          payload: 'DE0B6B3A7640000',
        };

        expect(actionResult[0]).toStrictEqual(expectedFirstActionResult);
        expect(actionResult[1]).toStrictEqual(expectedSecondActionResult);
        expect(actionResult[2].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[3].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
      });

      it('should create an action to update send amount mode to `INPUT` when mode is `MAX`', async () => {
        const sendState = {
          metamask: {
            blockGasLimit: '',
            selectedAddress: '',
            provider: {
              chainId: '0x1',
            },
          },
          send: getInitialStateWithExistingTxState({
            asset: {
              details: {},
            },
            gas: {
              gasPrice: '',
            },
            recipient: {
              address: '',
            },
            amount: {
              value: '',
            },
            userInputHexData: '',
          }),
        };

        const store = mockStore(sendState);

        await store.dispatch(updateSendAmount());

        const actionResult = store.getActions();

        const expectedFirstActionResult = {
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user set amount to 0 ETH',
        };

        const expectedSecondActionResult = {
          type: 'send/updateSendAmount',
          payload: undefined,
        };

        expect(actionResult[0]).toStrictEqual(expectedFirstActionResult);
        expect(actionResult[1]).toStrictEqual(expectedSecondActionResult);
        expect(actionResult[2].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[3].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
      });

      it('should create an action computeEstimateGasLimit and change states from pending to fulfilled with token asset types', async () => {
        const tokenAssetTypeSendState = {
          metamask: {
            blockGasLimit: '',
            selectedAddress: '',
            provider: {
              chainId: '0x1',
            },
          },
          send: getInitialStateWithExistingTxState({
            asset: {
              type: ASSET_TYPES.TOKEN,
              details: {},
            },
            gas: {
              gasPrice: '',
            },
            recipient: {
              address: '',
            },
            amount: {
              value: '',
            },
            userInputHexData: '',
          }),
        };

        const store = mockStore(tokenAssetTypeSendState);

        await store.dispatch(updateSendAmount());

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(4);
        expect(actionResult[0].type).toStrictEqual('send/addHistoryEntry');
        expect(actionResult[1].type).toStrictEqual('send/updateSendAmount');
        expect(actionResult[2].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[3].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
      });
    });

    describe('UpdateSendAsset', () => {
      const defaultSendAssetState = {
        metamask: {
          blockGasLimit: '',
          selectedAddress: '',
          provider: {
            chainId: '0x1',
          },
        },
        send: {
          ...getInitialStateWithExistingTxState({
            asset: {
              type: '',
              details: {},
            },
            gas: {
              gasPrice: '',
            },
            recipient: {
              address: '',
            },
            amount: {
              value: '',
            },
            userInputHexData: '',
          }),
          nativeBalance: '',
        },
      };

      it('should create actions for updateSendAsset', async () => {
        const store = mockStore(defaultSendAssetState);

        const newSendAsset = {
          type: ASSET_TYPES.NATIVE,
        };

        await store.dispatch(updateSendAsset(newSendAsset));

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(4);

        expect(actionResult[0]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user set asset of type NATIVE with symbol ETH',
        });
        expect(actionResult[1].type).toStrictEqual('send/updateAsset');
        expect(actionResult[1].payload).toStrictEqual({
          type: ASSET_TYPES.NATIVE,
          balance: '',
          error: null,
          details: null,
        });

        expect(actionResult[2].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[3].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
      });

      it('should create actions for updateSendAsset with tokens', async () => {
        global.eth = {
          contract: sinon.stub().returns({
            at: sinon.stub().returns({
              balanceOf: sinon.stub().returns(undefined),
            }),
          }),
        };
        const store = mockStore(defaultSendAssetState);

        const newSendAsset = {
          type: ASSET_TYPES.TOKEN,
          details: {
            address: 'tokenAddress',
            symbol: 'tokenSymbol',
            decimals: 'tokenDecimals',
          },
        };

        await store.dispatch(updateSendAsset(newSendAsset));

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(6);
        expect(actionResult[0].type).toStrictEqual('SHOW_LOADING_INDICATION');
        expect(actionResult[1].type).toStrictEqual('HIDE_LOADING_INDICATION');
        expect(actionResult[2]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: `sendFlow - user set asset to ERC20 token with symbol tokenSymbol and address tokenAddress`,
        });
        expect(actionResult[3].payload).toStrictEqual({
          type: ASSET_TYPES.TOKEN,
          details: {
            address: 'tokenAddress',
            symbol: 'tokenSymbol',
            decimals: 'tokenDecimals',
            standard: 'ERC20',
            balance: '0x0',
          },
          balance: '0x0',
          error: null,
        });

        expect(actionResult[4].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[5].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
      });

      it('should show ConvertTokenToNFT modal and throw "invalidAssetType" error when token passed in props is an ERC721 or ERC1155', async () => {
        process.env.COLLECTIBLES_V1 = true;
        getTokenStandardAndDetailsStub.mockImplementation(() =>
          Promise.resolve({ standard: 'ERC1155', balance: '0x1' }),
        );
        const store = mockStore(defaultSendAssetState);

        const newSendAsset = {
          type: ASSET_TYPES.TOKEN,
          details: {
            address: 'tokenAddress',
            symbol: 'tokenSymbol',
            decimals: 'tokenDecimals',
          },
        };

        await expect(() =>
          store.dispatch(updateSendAsset(newSendAsset)),
        ).rejects.toThrow('invalidAssetType');
        const actionResult = store.getActions();
        expect(actionResult).toHaveLength(6);
        expect(actionResult[0]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: `sendFlow - user set asset type to ${ASSET_TYPES.TOKEN}`,
        });
        expect(actionResult[1]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user set asset symbol to tokenSymbol',
        });
        expect(actionResult[2]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user set asset address to tokenAddress',
        });
        expect(actionResult[3].type).toStrictEqual('SHOW_LOADING_INDICATION');
        expect(actionResult[4].type).toStrictEqual('HIDE_LOADING_INDICATION');
        expect(actionResult[5]).toStrictEqual({
          payload: {
            name: 'CONVERT_TOKEN_TO_NFT',
            tokenAddress: 'tokenAddress',
          },
          type: 'UI_MODAL_OPEN',
        });
        process.env.COLLECTIBLES_V1 = false;
      });
    });

    describe('updateRecipientUserInput', () => {
      const updateRecipientUserInputState = {
        metamask: {
          provider: {
            chainId: '',
          },
          tokens: [],
          useTokenDetection: true,
          tokenList: {
            '0x514910771af9ca656af840dff83e8264ecf986ca': {
              address: '0x514910771af9ca656af840dff83e8264ecf986ca',
              symbol: 'LINK',
              decimals: 18,
              name: 'Chainlink',
              iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
              aggregators: [
                'airswapLight',
                'bancor',
                'cmc',
                'coinGecko',
                'kleros',
                'oneInch',
                'paraswap',
                'pmm',
                'totle',
                'zapper',
                'zerion',
                'zeroEx',
              ],
              occurrences: 12,
            },
          },
        },
      };

      it('should create actions for updateRecipientUserInput and checks debounce for validation', async () => {
        const clock = sinon.useFakeTimers();

        const store = mockStore(updateRecipientUserInputState);
        const newUserRecipientInput = 'newUserRecipientInput';

        await store.dispatch(updateRecipientUserInput(newUserRecipientInput));

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(1);
        expect(actionResult[0].type).toStrictEqual(
          'send/updateRecipientUserInput',
        );
        expect(actionResult[0].payload).toStrictEqual(newUserRecipientInput);

        clock.tick(300); // debounce

        const actionResultAfterDebounce = store.getActions();
        expect(actionResultAfterDebounce).toHaveLength(3);

        expect(actionResultAfterDebounce[1]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: `sendFlow - user typed ${newUserRecipientInput} into recipient input field`,
        });

        expect(actionResultAfterDebounce[2].type).toStrictEqual(
          'send/validateRecipientUserInput',
        );
        expect(actionResultAfterDebounce[2].payload).toStrictEqual({
          chainId: '',
          tokens: [],
          useTokenDetection: true,
          userInput: newUserRecipientInput,
          tokenAddressList: ['0x514910771af9ca656af840dff83e8264ecf986ca'],
        });
      });
    });

    describe('useContactListForRecipientSearch', () => {
      it('should create action to change send recipient search to contact list', async () => {
        const store = mockStore();

        await store.dispatch(useContactListForRecipientSearch());

        const actionResult = store.getActions();
        expect(actionResult).toHaveLength(2);

        expect(actionResult).toStrictEqual([
          {
            type: 'send/addHistoryEntry',
            payload: 'sendFlow - user selected back to all on recipient screen',
          },
          {
            type: 'send/updateRecipientSearchMode',
            payload: RECIPIENT_SEARCH_MODES.CONTACT_LIST,
          },
        ]);
      });
    });

    describe('UseMyAccountsForRecipientSearch', () => {
      it('should create action to change send recipient search to derived accounts', async () => {
        const store = mockStore();

        await store.dispatch(useMyAccountsForRecipientSearch());

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(2);

        expect(actionResult).toStrictEqual([
          {
            type: 'send/addHistoryEntry',
            payload:
              'sendFlow - user selected transfer to my accounts on recipient screen',
          },
          {
            type: 'send/updateRecipientSearchMode',
            payload: RECIPIENT_SEARCH_MODES.MY_ACCOUNTS,
          },
        ]);
      });
    });

    describe('UpdateRecipient', () => {
      const recipient = {
        address: '',
        nickname: '',
      };

      it('should create actions to update recipient and recalculate gas limit if the asset type is not set', async () => {
        global.eth = {
          getCode: sinon.stub(),
        };

        const updateRecipientState = {
          metamask: {
            addressBook: {},
            identities: {},
            provider: {
              chainId: '0x1',
            },
          },
          send: {
            account: {
              balance: '',
            },
            asset: {
              type: '',
            },
            gas: {
              gasPrice: '',
            },
            recipient: {
              address: '',
            },
            amount: {
              value: '',
            },
            userInputHexData: '',
          },
        };

        const store = mockStore(updateRecipientState);

        await store.dispatch(updateRecipient(recipient));

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(3);
        expect(actionResult[0].type).toStrictEqual('send/updateRecipient');
        expect(actionResult[1].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[2].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
      });

      it('should update recipient nickname if the passed address exists in the addressBook state but no nickname param is provided', async () => {
        global.eth = {
          getCode: sinon.stub(),
        };

        const TEST_RECIPIENT_ADDRESS =
          '0x0000000000000000000000000000000000000001';
        const TEST_RECIPIENT_NAME = 'The 1 address';

        const updateRecipientState = {
          metamask: {
            addressBook: {
              '0x1': [
                {
                  address: TEST_RECIPIENT_ADDRESS,
                  name: TEST_RECIPIENT_NAME,
                },
              ],
            },
            provider: {
              chainId: '0x1',
            },
          },
          send: {
            account: {
              balance: '',
            },
            asset: {
              type: '',
            },
            gas: {
              gasPrice: '',
            },
            recipient: {
              address: '',
            },
            amount: {
              value: '',
            },
            userInputHexData: '',
          },
        };

        const store = mockStore(updateRecipientState);

        await store.dispatch(
          updateRecipient({
            address: '0x0000000000000000000000000000000000000001',
            nickname: '',
          }),
        );

        const actionResult = store.getActions();
        expect(actionResult).toHaveLength(3);
        expect(actionResult[0].type).toStrictEqual('send/updateRecipient');
        expect(actionResult[0].payload.address).toStrictEqual(
          TEST_RECIPIENT_ADDRESS,
        );
        expect(actionResult[0].payload.nickname).toStrictEqual(
          TEST_RECIPIENT_NAME,
        );
      });

      it('should create actions to reset recipient input and ens, calculate gas and then validate input', async () => {
        const tokenState = {
          metamask: {
            addressBook: {},
            identities: {},
            blockGasLimit: '',
            selectedAddress: '',
            provider: {
              chainId: '0x1',
            },
          },
          send: {
            account: {
              balance: '',
            },
            asset: {
              type: ASSET_TYPES.TOKEN,
              details: {},
            },
            gas: {
              gasPrice: '',
            },
            recipient: {
              address: '',
            },
            amount: {
              value: '',
            },
            userInputHexData: '',
          },
        };

        const store = mockStore(tokenState);

        await store.dispatch(updateRecipient(recipient));

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(3);
        expect(actionResult[0].type).toStrictEqual('send/updateRecipient');
        expect(actionResult[1].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[2].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
      });
    });

    describe('ResetRecipientInput', () => {
      it('should create actions to reset recipient input and ens then validates input', async () => {
        const updateRecipientState = {
          metamask: {
            addressBook: {},
            identities: {},
            provider: {
              chainId: '',
            },
            tokens: [],
            useTokenDetection: true,
            tokenList: {
              0x514910771af9ca656af840dff83e8264ecf986ca: {
                address: '0x514910771af9ca656af840dff83e8264ecf986ca',
                symbol: 'LINK',
                decimals: 18,
                name: 'Chainlink',
                iconUrl:
                  'https://s3.amazonaws.com/airswap-token-images/LINK.png',
                aggregators: [
                  'airswapLight',
                  'bancor',
                  'cmc',
                  'coinGecko',
                  'kleros',
                  'oneInch',
                  'paraswap',
                  'pmm',
                  'totle',
                  'zapper',
                  'zerion',
                  'zeroEx',
                ],
                occurrences: 12,
              },
            },
          },
          send: {
            asset: {
              type: '',
            },
            recipient: {
              address: 'Address',
              nickname: 'NickName',
            },
            gas: {
              gasPrice: '0x1',
            },
            amount: {
              value: '0x1',
            },
          },
        };

        const store = mockStore(updateRecipientState);

        await store.dispatch(resetRecipientInput());
        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(7);
        expect(actionResult[0]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user cleared recipient input',
        });
        expect(actionResult[1].type).toStrictEqual(
          'send/updateRecipientUserInput',
        );
        expect(actionResult[1].payload).toStrictEqual('');
        expect(actionResult[2].type).toStrictEqual('send/updateRecipient');
        expect(actionResult[3].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[4].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
        expect(actionResult[5].type).toStrictEqual('ENS/resetEnsResolution');
        expect(actionResult[6].type).toStrictEqual(
          'send/validateRecipientUserInput',
        );
      });
    });

    describe('UpdateSendHexData', () => {
      const sendHexDataState = {
        send: getInitialStateWithExistingTxState({
          asset: {
            type: '',
          },
        }),
      };

      it('should create action to update hexData', async () => {
        const hexData = '0x1';
        const store = mockStore(sendHexDataState);

        await store.dispatch(updateSendHexData(hexData));

        const actionResult = store.getActions();

        const expectActionResult = [
          {
            type: 'send/addHistoryEntry',
            payload: 'sendFlow - user added custom hexData 0x1',
          },
          { type: 'send/updateUserInputHexData', payload: hexData },
        ];

        expect(actionResult).toHaveLength(2);
        expect(actionResult).toStrictEqual(expectActionResult);
      });
    });

    describe('ToggleSendMaxMode', () => {
      it('should create actions to toggle update max mode when send amount mode is not max', async () => {
        const sendMaxModeState = {
          send: {
            asset: {
              type: ASSET_TYPES.TOKEN,
              details: {},
            },
            gas: {
              gasPrice: '',
            },
            recipient: {
              address: '',
            },
            amount: {
              mode: '',
              value: '',
            },
            userInputHexData: '',
          },
          metamask: {
            provider: {
              chainId: RINKEBY_CHAIN_ID,
            },
          },
        };

        const store = mockStore(sendMaxModeState);

        await store.dispatch(toggleSendMaxMode());

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(5);
        expect(actionResult[0].type).toStrictEqual('send/updateAmountMode');
        expect(actionResult[1].type).toStrictEqual('send/updateAmountToMax');
        expect(actionResult[2]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user toggled max mode on',
        });
        expect(actionResult[3].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[4].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
      });

      it('should create actions to toggle off max mode when send amount mode is max', async () => {
        const sendMaxModeState = {
          send: {
            ...getInitialStateWithExistingTxState({
              asset: {
                type: ASSET_TYPES.TOKEN,
                details: {},
              },
              gas: {
                gasPrice: '',
              },
              recipient: {
                address: '',
              },
              amount: {
                value: '',
              },
              userInputHexData: '',
            }),
            amountMode: AMOUNT_MODES.MAX,
          },
          metamask: {
            provider: {
              chainId: RINKEBY_CHAIN_ID,
            },
          },
        };
        const store = mockStore(sendMaxModeState);

        await store.dispatch(toggleSendMaxMode());

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(5);
        expect(actionResult[0].type).toStrictEqual('send/updateAmountMode');
        expect(actionResult[1].type).toStrictEqual('send/updateSendAmount');
        expect(actionResult[2]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user toggled max mode off',
        });
        expect(actionResult[3].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[4].type).toStrictEqual(
          'send/computeEstimatedGasLimit/rejected',
        );
      });
    });

    describe('SignTransaction', () => {
      const signTransactionState = {
        send: getInitialStateWithExistingTxState({
          id: 1,
          asset: {},
          recipient: {},
          amount: {},
          gas: {
            gasLimit: GAS_LIMITS.SIMPLE,
          },
        }),
      };

      it('should show confirm tx page when no other conditions for signing have been met', async () => {
        const store = mockStore(signTransactionState);

        await store.dispatch(signTransaction());

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(2);
        expect(actionResult[0]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload:
            'sendFlow - user clicked next and transaction should be added to controller',
        });
        expect(actionResult[1].type).toStrictEqual('SHOW_CONF_TX_PAGE');
      });

      it('should create actions for updateTransaction rejecting', async () => {
        const editStageSignTxState = {
          metamask: {
            unapprovedTxs: {
              1: {
                id: 1,
                txParams: {
                  value: 'oldTxValue',
                },
              },
            },
          },
          send: {
            ...signTransactionState.send,
            stage: SEND_STAGES.EDIT,
          },
        };

        jest.mock('../../store/actions.js');

        const store = mockStore(editStageSignTxState);

        await store.dispatch(signTransaction());

        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(3);
        expect(actionResult[0]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload:
            'sendFlow - user clicked next and transaction should be updated in controller',
        });
        expect(actionResult[1].type).toStrictEqual(
          'UPDATE_TRANSACTION_EDITABLE_PARAMS',
        );
        expect(actionResult[2].type).toStrictEqual(
          'UPDATE_TRANSACTION_GAS_FEES',
        );
      });
    });

    describe('editTransaction', () => {
      it('should set up the appropriate state for editing a native asset transaction', async () => {
        const editTransactionState = {
          metamask: {
            gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
            gasFeeEstimates: {},
            provider: {
              chainId: RINKEBY_CHAIN_ID,
            },
            tokens: [],
            addressBook: {
              [RINKEBY_CHAIN_ID]: {},
            },
            identities: {},
            cachedBalances: {
              [RINKEBY_CHAIN_ID]: {
                '0xAddress': '0xde0b6b3a76400000',
              },
            },
            accounts: {
              '0xAddress': {
                address: '0xAddress',
              },
            },
            tokenList: {},
            unapprovedTxs: {
              1: {
                id: 1,
                txParams: {
                  data: '',
                  from: '0xAddress',
                  to: '0xRecipientAddress',
                  gas: GAS_LIMITS.SIMPLE,
                  gasPrice: '0x3b9aca00', // 1000000000
                  value: '0xde0b6b3a7640000', // 1000000000000000000
                },
              },
            },
          },
          send: getInitialStateWithExistingTxState({
            asset: {
              type: '',
            },
            recipient: {
              address: 'Address',
              nickname: 'NickName',
            },
          }),
        };

        const store = mockStore(editTransactionState);

        const expectedActions = [
          { payload: undefined, type: 'send/clearPreviousDrafts' },
          {
            payload: {
              amount: { error: null, value: '0xde0b6b3a7640000' },
              asset: {
                balance: '0x0',
                details: null,
                error: null,
                type: 'NATIVE',
              },
              fromAccount: {
                address: '0xAddress',
                balance: '0xde0b6b3a76400000',
              },
              gas: {
                error: null,
                gasLimit: '0x5208',
                gasPrice: '0x3b9aca00',
                gasTotal: '0x0',
                maxFeePerGas: '0x0',
                maxPriorityFeePerGas: '0x0',
              },
              history: [
                'sendFlow - user clicked edit on transaction with id 1',
              ],
              id: 1,
              recipient: {
                address: '0xRecipientAddress',
                error: null,
                nickname: '',
                warning: null,
              },
              status: 'VALID',
              transactionType: '0x0',
              userInputHexData: '',
            },
            type: 'send/addNewDraft',
          },
          {
            payload: 'sendFlow - user set asset of type NATIVE with symbol ETH',
            type: 'send/addHistoryEntry',
          },
          {
            payload: {
              balance: '0x0',
              details: null,
              error: null,
              type: 'NATIVE',
            },
            type: 'send/updateAsset',
          },
          {
            meta: {
              arg: undefined,
              requestId: 'aEql9mye65IeRqnwq-vSJ',
              requestStatus: 'pending',
            },
            payload: undefined,
            type: 'send/computeEstimatedGasLimit/pending',
          },
          { type: 'metamask/gas/SET_CUSTOM_GAS_LIMIT', value: '0x5208' },
          {
            meta: {
              arg: undefined,
              requestId: 'aEql9mye65IeRqnwq-vSJ',
              requestStatus: 'fulfilled',
            },
            payload: { gasLimit: '0x5208', layer1GasTotal: undefined },
            type: 'send/computeEstimatedGasLimit/fulfilled',
          },
          {
            meta: {
              arg: undefined,
              requestId: 'KYskR3Mmj0x_0QVI-TH0l',
              requestStatus: 'pending',
            },
            payload: undefined,
            type: 'send/initializeSendState/pending',
          },
          { type: 'metamask/gas/SET_CUSTOM_GAS_LIMIT', value: '0x5208' },
          {
            meta: {
              arg: undefined,
              requestId: 'KYskR3Mmj0x_0QVI-TH0l',
              requestStatus: 'fulfilled',
            },
            payload: {
              account: undefined,
              chainId: '0x4',
              eip1559support: false,
              gasEstimatePollToken: undefined,
              gasEstimateType: 'none',
              gasFeeEstimates: {},
              gasLimit: '0x5208',
              gasTotal: '0x0',
              tokenAddressList: [],
              tokens: [],
              useTokenDetection: false,
            },
            type: 'send/initializeSendState/fulfilled',
          },
        ];

        await store.dispatch(editExistingTransaction(ASSET_TYPES.NATIVE, 1));
        const actionResult = store.getActions();

        expect(actionResult).toHaveLength(9);
        expect(actionResult[0]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user clicked edit on transaction with id 1',
        });
        expect(actionResult[1].type).toStrictEqual('send/editTransaction');
        expect(actionResult[1].payload).toStrictEqual({
          address: '0xRecipientAddress',
          amount: '0xde0b6b3a7640000',
          data: '',
          from: '0xAddress',
          gasLimit: GAS_LIMITS.SIMPLE,
          gasPrice: '0x3b9aca00',
          id: 1,
          nickname: '',
        });

        const action = actionResult[1];

        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        expect(result.gas.gasLimit).toStrictEqual(action.payload.gasLimit);
        expect(result.gas.gasPrice).toStrictEqual(action.payload.gasPrice);

        expect(result.amount.value).toStrictEqual(action.payload.amount);
      });

      it('should set up the appropriate state for editing a collectible asset transaction', async () => {
        const editTransactionState = {
          metamask: {
            blockGasLimit: '0x3a98',
            selectedAddress: '',
            provider: {
              chainId: RINKEBY_CHAIN_ID,
            },
            tokens: [],
            addressBook: {
              [RINKEBY_CHAIN_ID]: {},
            },
            identities: {},
            unapprovedTxs: {
              1: {
                id: 1,
                txParams: {
                  data: generateERC20TransferData({
                    toAddress: '0xRecipientAddress',
                    amount: ethers.BigNumber.from(15000),
                    sendToken: {
                      address: '0xTokenAddress',
                      symbol: 'TST',
                      decimals: 4,
                    },
                  }),
                  from: '0xAddress',
                  to: '0xTokenAddress',
                  gas: GAS_LIMITS.BASE_TOKEN_ESTIMATE,
                  gasPrice: '0x3b9aca00', // 1000000000
                  value: '0x0',
                },
              },
            },
          },
          send: {
            account: {
              address: '0xAddress',
              balance: '0x0',
            },
            asset: {
              type: '',
            },
            gas: {
              gasPrice: '',
            },
            amount: {
              value: '',
            },
            userInputHexData: '',

            recipient: {
              address: 'Address',
              nickname: 'NickName',
            },
          },
        };

        global.eth = {
          contract: sinon.stub().returns({
            at: sinon.stub().returns({
              balanceOf: sinon.stub().returns(undefined),
            }),
          }),
          getCode: jest.fn(() => '0xa'),
        };

        const store = mockStore(editTransactionState);

        await store.dispatch(
          editExistingTransaction(
            ASSET_TYPES.COLLECTIBLE,
            1,
            {
              name: TRANSACTION_TYPES.TOKEN_METHOD_TRANSFER_FROM,
              args: {
                _to: '0xRecipientAddress',
                _value: ethers.BigNumber.from(15000),
              },
            },
            {
              address: '0xf5de760f2e916647fd766B4AD9E85ff943cE3A2b',
              description: 'A test NFT dispensed from faucet.paradigm.xyz.',
              image:
                'https://ipfs.io/ipfs/bafybeifvwitulq6elvka2hoqhwixfhgb42l4aiukmtrw335osetikviuuu',
              name: 'MultiFaucet Test NFT',
              standard: 'ERC721',
              tokenId: '26847',
            },
          ),
        );
        const actionResult = store.getActions();
        expect(actionResult).toHaveLength(9);
        expect(actionResult[0]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user clicked edit on transaction with id 1',
        });
        expect(actionResult[1]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: `sendFlow - user set asset type to ${ASSET_TYPES.COLLECTIBLE}`,
        });
        expect(actionResult[2]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user set asset symbol to undefined',
        });
        expect(actionResult[3]).toMatchObject({
          type: 'send/addHistoryEntry',
          payload: 'sendFlow - user set asset address to 0xTokenAddress',
        });
        expect(actionResult[4].type).toStrictEqual('send/updateAsset');
        expect(actionResult[4].payload).toStrictEqual({
          balance: '0x1',
          type: ASSET_TYPES.COLLECTIBLE,
          error: null,
          details: {
            address: '0xTokenAddress',
            description: 'A test NFT dispensed from faucet.paradigm.xyz.',
            image:
              'https://ipfs.io/ipfs/bafybeifvwitulq6elvka2hoqhwixfhgb42l4aiukmtrw335osetikviuuu',
            name: 'MultiFaucet Test NFT',
            standard: 'ERC721',
            tokenId: '26847',
          },
        });
        expect(actionResult[5].type).toStrictEqual(
          'send/computeEstimatedGasLimit/pending',
        );
        expect(actionResult[6].type).toStrictEqual(
          'metamask/gas/SET_CUSTOM_GAS_LIMIT',
        );
        expect(actionResult[7].type).toStrictEqual(
          'send/computeEstimatedGasLimit/fulfilled',
        );
        expect(actionResult[8].type).toStrictEqual('send/editTransaction');
        const action = actionResult[8];

        const result = sendReducer(
          INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          action,
        );

        expect(result.gas.gasLimit).toStrictEqual(action.payload.gasLimit);
        expect(result.gas.gasPrice).toStrictEqual(action.payload.gasPrice);

        expect(result.amount.value).toStrictEqual(action.payload.amount);
      });
    });

    it('should set up the appropriate state for editing a token asset transaction', async () => {
      const editTransactionState = {
        metamask: {
          blockGasLimit: '0x3a98',
          selectedAddress: '',
          provider: {
            chainId: RINKEBY_CHAIN_ID,
          },
          tokens: [],
          addressBook: {
            [RINKEBY_CHAIN_ID]: {},
          },
          identities: {},
          unapprovedTxs: {
            1: {
              id: 1,
              txParams: {
                data: '',
                from: '0xAddress',
                to: '0xTokenAddress',
                gas: GAS_LIMITS.BASE_TOKEN_ESTIMATE,
                gasPrice: '0x3b9aca00', // 1000000000
                value: '0x0',
              },
            },
          },
        },
        send: {
          account: {
            address: '0xAddress',
            balance: '0x0',
          },
          asset: {
            type: '',
          },
          gas: {
            gasPrice: '',
          },
          amount: {
            value: '',
          },
          userInputHexData: '',
          recipient: {
            address: 'Address',
            nickname: 'NickName',
          },
        },
      };

      global.eth = {
        contract: sinon.stub().returns({
          at: sinon.stub().returns({
            balanceOf: sinon.stub().returns(undefined),
          }),
        }),
        getCode: jest.fn(() => '0xa'),
      };

      const store = mockStore(editTransactionState);

      await store.dispatch(
        editTransaction(
          ASSET_TYPES.TOKEN,
          1,
          {
            name: TRANSACTION_TYPES.TOKEN_METHOD_TRANSFER,
            args: {
              _to: '0xRecipientAddress',
              _value: ethers.BigNumber.from(15000),
            },
          },
          { address: '0xAddress', symbol: 'SYMB', decimals: 18 },
        ),
      );
      const actionResult = store.getActions();

      expect(actionResult).toHaveLength(11);
      expect(actionResult[0]).toMatchObject({
        type: 'send/addHistoryEntry',
        payload: 'sendFlow - user clicked edit on transaction with id 1',
      });
      expect(actionResult[1]).toMatchObject({
        type: 'send/addHistoryEntry',
        payload: `sendFlow - user set asset type to ${ASSET_TYPES.TOKEN}`,
      });
      expect(actionResult[2]).toMatchObject({
        type: 'send/addHistoryEntry',
        payload: 'sendFlow - user set asset symbol to SYMB',
      });
      expect(actionResult[3]).toMatchObject({
        type: 'send/addHistoryEntry',
        payload: 'sendFlow - user set asset address to 0xTokenAddress',
      });
      expect(actionResult[4].type).toStrictEqual('SHOW_LOADING_INDICATION');
      expect(actionResult[5].type).toStrictEqual('HIDE_LOADING_INDICATION');
      expect(actionResult[6].type).toStrictEqual('send/updateAsset');
      expect(actionResult[6].payload).toStrictEqual({
        balance: '0x0',
        type: ASSET_TYPES.TOKEN,
        error: null,
        details: {
          address: '0xTokenAddress',
          decimals: 18,
          symbol: 'SYMB',
          standard: 'ERC20',
        },
      });
      expect(actionResult[7].type).toStrictEqual(
        'send/computeEstimatedGasLimit/pending',
      );
      expect(actionResult[8].type).toStrictEqual(
        'metamask/gas/SET_CUSTOM_GAS_LIMIT',
      );
      expect(actionResult[9].type).toStrictEqual(
        'send/computeEstimatedGasLimit/fulfilled',
      );
      expect(actionResult[10].type).toStrictEqual('send/editTransaction');
      expect(actionResult[10].payload).toStrictEqual({
        address: '0xrecipientaddress', // getting address from tokenData does .toLowerCase
        amount: '0x3a98',
        data: '',
        from: '0xAddress',
        gasLimit: GAS_LIMITS.BASE_TOKEN_ESTIMATE,
        gasPrice: '0x3b9aca00',
        id: 1,
        nickname: '',
      });

      const action = actionResult[10];

      const result = sendReducer(INITIAL_TEST_STATE_FOR_EXISTING_DRAFT, action);

      expect(result.gas.gasLimit).toStrictEqual(action.payload.gasLimit);
      expect(result.gas.gasPrice).toStrictEqual(action.payload.gasPrice);

      expect(result.amount.value).toStrictEqual(action.payload.amount);
    });
  });

  describe('selectors', () => {
    describe('gas selectors', () => {
      it('has a selector that gets gasLimit', () => {
        expect(
          getGasLimit({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe('0x0');
      });

      it('has a selector that gets gasPrice', () => {
        expect(
          getGasPrice({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe('0x0');
      });

      it('has a selector that gets gasTotal', () => {
        expect(
          getGasTotal({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe('0x0');
      });

      it('has a selector to determine if gas fee is in error', () => {
        expect(
          gasFeeIsInError({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe(false);
        expect(
          gasFeeIsInError({
            send: getInitialStateWithExistingTxState({
              gas: {
                error: 'yes',
              },
            }),
          }),
        ).toBe(true);
      });

      it('has a selector that gets minimumGasLimit', () => {
        expect(
          getMinimumGasLimitForSend({
            send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          }),
        ).toBe(GAS_LIMITS.SIMPLE);
      });

      describe('getGasInputMode selector', () => {
        it('returns BASIC when on mainnet and advanced inline gas is false', () => {
          expect(
            getGasInputMode({
              metamask: {
                provider: { chainId: MAINNET_CHAIN_ID },
                featureFlags: { advancedInlineGas: false },
              },
              send: initialState,
            }),
          ).toBe(GAS_INPUT_MODES.BASIC);
        });

        it('returns BASIC when on localhost and advanced inline gas is false and IN_TEST is set', () => {
          process.env.IN_TEST = true;
          expect(
            getGasInputMode({
              metamask: {
                provider: { chainId: '0x539' },
                featureFlags: { advancedInlineGas: false },
              },
              send: initialState,
            }),
          ).toBe(GAS_INPUT_MODES.BASIC);
          process.env.IN_TEST = false;
        });

        it('returns INLINE when on mainnet and advanced inline gas is true', () => {
          expect(
            getGasInputMode({
              metamask: {
                provider: { chainId: MAINNET_CHAIN_ID },
                featureFlags: { advancedInlineGas: true },
              },
              send: initialState,
            }),
          ).toBe(GAS_INPUT_MODES.INLINE);
        });

        it('returns INLINE when on mainnet and advanced inline gas is false but eth_gasPrice estimate is used', () => {
          expect(
            getGasInputMode({
              metamask: {
                provider: { chainId: MAINNET_CHAIN_ID },
                featureFlags: { advancedInlineGas: false },
                gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
              },
              send: initialState,
            }),
          ).toBe(GAS_INPUT_MODES.INLINE);
        });

        it('returns INLINE when on mainnet and advanced inline gas is false but eth_gasPrice estimate is used even IN_TEST', () => {
          process.env.IN_TEST = true;
          expect(
            getGasInputMode({
              metamask: {
                provider: { chainId: MAINNET_CHAIN_ID },
                featureFlags: { advancedInlineGas: false },
                gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
              },
              send: initialState,
            }),
          ).toBe(GAS_INPUT_MODES.INLINE);
          process.env.IN_TEST = false;
        });

        it('returns CUSTOM if isCustomGasSet is true', () => {
          expect(
            getGasInputMode({
              metamask: {
                provider: { chainId: MAINNET_CHAIN_ID },
                featureFlags: { advancedInlineGas: true },
              },
              send: {
                ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
                isCustomGasSet: true,
              },
            }),
          ).toBe(GAS_INPUT_MODES.CUSTOM);
        });
      });
    });

    describe('asset selectors', () => {
      it('has a selector to get the asset', () => {
        expect(
          getSendAsset({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toMatchObject(
          getTestUUIDTx(INITIAL_TEST_STATE_FOR_EXISTING_DRAFT).asset,
        );
      });

      it('has a selector to get the asset address', () => {
        expect(
          getSendAssetAddress({
            send: getInitialStateWithExistingTxState({
              asset: {
                balance: '0x0',
                details: { address: '0x0' },
                type: ASSET_TYPES.TOKEN,
              },
            }),
          }),
        ).toBe('0x0');
      });

      it('has a selector that determines if asset is sendable based on ERC721 status', () => {
        expect(
          getIsAssetSendable({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe(true);
        expect(
          getIsAssetSendable({
            send: getInitialStateWithExistingTxState({
              asset: {
                type: ASSET_TYPES.TOKEN,
                details: { isERC721: true },
              },
            }),
          }),
        ).toBe(false);
      });
    });

    describe('amount selectors', () => {
      it('has a selector to get send amount', () => {
        expect(
          getSendAmount({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe('0x0');
      });

      it('has a selector to get if there is an insufficient funds error', () => {
        expect(
          getIsBalanceInsufficient({
            send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          }),
        ).toBe(false);
        expect(
          getIsBalanceInsufficient({
            send: getInitialStateWithExistingTxState({
              gas: { error: INSUFFICIENT_FUNDS_ERROR },
            }),
          }),
        ).toBe(true);
      });

      it('has a selector to get max mode state', () => {
        expect(
          getSendMaxModeState({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe(false);
        expect(
          getSendMaxModeState({
            send: {
              ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
              amountMode: AMOUNT_MODES.MAX,
            },
          }),
        ).toBe(true);
      });

      it('has a selector to get the draft transaction ID', () => {
        expect(
          getDraftTransactionID({
            send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          }),
        ).toBeNull();
        expect(
          getDraftTransactionID({
            send: getInitialStateWithExistingTxState({
              id: 'ID',
            }),
          }),
        ).toBe('ID');
      });

      it('has a selector to get the user entered hex data', () => {
        expect(
          getSendHexData({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBeNull();
        expect(
          getSendHexData({
            send: getInitialStateWithExistingTxState({
              userInputHexData: '0x0',
            }),
          }),
        ).toBe('0x0');
      });

      it('has a selector to get if there is an amount error', () => {
        expect(
          sendAmountIsInError({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe(false);
        expect(
          sendAmountIsInError({
            send: getInitialStateWithExistingTxState({
              amount: { error: 'any' },
            }),
          }),
        ).toBe(true);
      });
    });

    describe('recipient selectors', () => {
      it('has a selector to get recipient address', () => {
        expect(getSendTo({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT })).toBe(
          '',
        );
        expect(
          getSendTo({
            send: getInitialStateWithExistingTxState({
              recipient: { address: '0xb' },
            }),
          }),
        ).toBe('0xb');
      });

      it('has a selector to check if using the my accounts option for recipient selection', () => {
        expect(
          getIsUsingMyAccountForRecipientSearch({
            send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          }),
        ).toBe(false);
        expect(
          getIsUsingMyAccountForRecipientSearch({
            send: {
              ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
              recipientMode: RECIPIENT_SEARCH_MODES.MY_ACCOUNTS,
            },
          }),
        ).toBe(true);
      });

      it('has a selector to get recipient user input in input field', () => {
        expect(
          getRecipientUserInput({
            send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          }),
        ).toBe('');
        expect(
          getRecipientUserInput({
            send: {
              ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
              recipientInput: 'domain.eth',
            },
          }),
        ).toBe('domain.eth');
      });

      it('has a selector to get recipient state', () => {
        expect(
          getRecipient({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toMatchObject(
          getTestUUIDTx(INITIAL_TEST_STATE_FOR_EXISTING_DRAFT).recipient,
        );
      });
    });

    describe('send validity selectors', () => {
      it('has a selector to get send errors', () => {
        expect(
          getSendErrors({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toMatchObject({
          gasFee: null,
          amount: null,
        });
        expect(
          getSendErrors({
            send: getInitialStateWithExistingTxState({
              gas: {
                error: 'gasFeeTest',
              },
              amount: {
                error: 'amountTest',
              },
            }),
          }),
        ).toMatchObject({ gasFee: 'gasFeeTest', amount: 'amountTest' });
      });

      it('has a selector to get send state initialization status', () => {
        expect(
          isSendStateInitialized({
            send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
          }),
        ).toBe(false);
        expect(
          isSendStateInitialized({
            send: {
              ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
              stage: SEND_STATUSES.ADD_RECIPIENT,
            },
          }),
        ).toBe(true);
      });

      it('has a selector to get send state validity', () => {
        expect(
          isSendFormInvalid({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe(false);
        expect(
          isSendFormInvalid({
            send: getInitialStateWithExistingTxState({
              status: SEND_STATUSES.INVALID,
            }),
          }),
        ).toBe(true);
      });

      it('has a selector to get send stage', () => {
        expect(
          getSendStage({ send: INITIAL_TEST_STATE_FOR_EXISTING_DRAFT }),
        ).toBe(SEND_STAGES.INACTIVE);
        expect(
          getSendStage({
            send: {
              ...INITIAL_TEST_STATE_FOR_EXISTING_DRAFT,
              stage: SEND_STAGES.ADD_RECIPIENT,
            },
          }),
        ).toBe(SEND_STAGES.ADD_RECIPIENT);
      });
    });
  });
});
