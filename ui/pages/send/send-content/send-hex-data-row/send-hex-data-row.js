import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  getSendHexData,
  isHexDataError,
  updateSendHexData,
} from '../../../../ducks/send';
import SendRowWrapper from '../send-row-wrapper';
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

  return (
    <>
      <SendRowWrapper
        label={`${t('hexData')}`}
        showError={showHexDataError}
        errorType="hexData"
      >
        <textarea
          onInput={onInput}
          placeholder={t('optional')}
          className="send-v2__hex-data__input"
          defaultValue={data.input || ''}
          data-testid="hex-data-area"
        />
      </SendRowWrapper>
    </>
  );
};

export default SendHexDataRow;
