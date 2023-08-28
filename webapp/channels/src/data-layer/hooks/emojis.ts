// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect} from 'react';
import {SagaMiddleware} from 'redux-saga';
import {useDispatch, useSelector} from 'react-redux';

import {EmojiTypes} from 'mattermost-redux/action_types';

import {fetchEmojisByName} from 'data-layer/sagas/emojis';

import {getEmojiMap} from 'selectors/emojis';

import {sagaMiddleware} from 'stores/redux_store';

import {GlobalState} from 'types/store';

export function useEmojiByName(name: string) {
    const emojiMap = useSelector((state: GlobalState) => getEmojiMap(state));
    const emoji = emojiMap.get(name);

    const dispatch = useDispatch();
    useEffect(() => {
        if (emoji) {
            return;
        }

        dispatch({
            type: EmojiTypes.FETCH_EMOJI_BY_NAME,
            name,
        });
    }, [dispatch, emoji, name]);

    return emoji;
}

(sagaMiddleware as SagaMiddleware).run(fetchEmojisByName);
