import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  getSendHexData,
  isHexDataError,
  updateSendHexData,
} from '../../../../ducks/send';
import SendRowWrapper from '../send-row-wrapper';
import Dialog from '../../../../components/ui/dialog';
import { useI18nContext } from '../../../../hooks/useI18nContext';

const SendHexDataRow = () => {
  const t = useI18nContext();

  const data = useSelector(getSendHexData);

  const showHexDataError = useSelector(isHexDataError);

  const dispatch = useDispatch();

  const onInput = async (event) => {
    const hexData = event.target.value.replace(/\n/gu, '') || null;
    dispatch(updateSendHexData(hexData));
  };

  const renderError = () => {
    return (
      <Dialog
        type="error"
        className="send__error-dialog"
        data-testid="hex-data-error-message"
      >
        {t('invalidHexString')}
      </Dialog>
    );
  };

  return (
    <>
      <SendRowWrapper
        label={`${t('hexData')}`}
        showError={false}
        errorType="amount"
      >
        <textarea
          onInput={onInput}
          placeholder={t('optional')}
          className="send-v2__hex-data__input"
          defaultValue={data.input || ''}
          data-testid="hex-data-area"
        />
      </SendRowWrapper>
      {showHexDataError && renderError()}
    </>
  );
};

export default SendHexDataRow;
