// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Client4} from 'mattermost-redux/client';
import {EmojiTypes} from 'mattermost-redux/action_types';
import {General, Emoji} from '../constants';

import {getCustomEmojisByName as selectCustomEmojisByName, getShouldFetchEmojiByName, systemEmojis} from 'mattermost-redux/selectors/entities/emojis';
import {parseNeededCustomEmojisFromText} from 'mattermost-redux/utils/emoji_utils';

import {GetStateFunc, DispatchFunc, ActionFunc} from 'mattermost-redux/types/actions';

import {CustomEmoji} from '@mattermost/types/emojis';

import {logError} from './errors';
import {bindClientFunc, forceLogoutIfNecessary} from './helpers';

import {getProfilesByIds} from './users';

// HARRISON TODO figure out where to put the fetchEmojisByName saga

export function createCustomEmoji(emoji: any, image: any): ActionFunc {
    return bindClientFunc({
        clientFunc: Client4.createCustomEmoji,
        onSuccess: EmojiTypes.RECEIVED_CUSTOM_EMOJI,
        params: [
            emoji,
            image,
        ],
    });
}

export function getCustomEmoji(emojiId: string): ActionFunc {
    console.log('HARRISON getCustomEmoji', emojiId);

    return bindClientFunc({
        clientFunc: Client4.getCustomEmoji,
        onSuccess: EmojiTypes.RECEIVED_CUSTOM_EMOJI,
        params: [
            emojiId,
        ],
    });
}

export function fetchEmojiByNameIfNeeded(name: string) {
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
        if (!getShouldFetchEmojiByName(getState(), name)) {
            return {data: true};
        }

        return dispatch(fetchCustomEmojiByName(name));
    };
}

export function fetchCustomEmojiByName(name: string) {
    return {
        type: EmojiTypes.FETCH_EMOJI_BY_NAME,
        name,
    };
}

export function fetchEmojisByNameIfNeeded(names: string[]) {
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const state = getState();

        const filteredNames = names.filter((name) => getShouldFetchEmojiByName(state, name));

        if (filteredNames.length === 0) {
            return {data: true};
        }

        return dispatch(fetchCustomEmojisByName(filteredNames));
    };
}

function fetchCustomEmojisByName(names: string[]) {
    return {
        type: EmojiTypes.FETCH_EMOJIS_BY_NAME,
        names,
    };
}

export function getCustomEmojisInText(text: string): ActionFunc {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        if (!text) {
            return {data: true};
        }

        const state = getState();
        const nonExistentEmoji = state.entities.emojis.nonExistentEmoji;
        const customEmojisByName = selectCustomEmojisByName(state);

        const emojisToLoad = parseNeededCustomEmojisFromText(text, systemEmojis, customEmojisByName, nonExistentEmoji);

        return dispatch(fetchCustomEmojisByName(Array.from(emojisToLoad)));
    };
}

export function getCustomEmojis(
    page = 0,
    perPage: number = General.PAGE_SIZE_DEFAULT,
    sort: string = Emoji.SORT_BY_NAME,
    loadUsers = false,
): ActionFunc {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        return {data: false};
        let data;
        try {
            data = await Client4.getCustomEmojis(page, perPage, sort);
        } catch (error) {
            forceLogoutIfNecessary(error, dispatch, getState);

            dispatch(logError(error));
            return {error};
        }

        if (loadUsers) {
            dispatch(loadProfilesForCustomEmojis(data));
        }

        dispatch({
            type: EmojiTypes.RECEIVED_CUSTOM_EMOJIS,
            data,
        });

        return {data};
    };
}

export function loadProfilesForCustomEmojis(emojis: CustomEmoji[]): ActionFunc {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const usersToLoad: Record<string, boolean> = {};
        emojis.forEach((emoji: CustomEmoji) => {
            if (!getState().entities.users.profiles[emoji.creator_id]) {
                usersToLoad[emoji.creator_id] = true;
            }
        });

        const userIds = Object.keys(usersToLoad);

        if (userIds.length > 0) {
            await dispatch(getProfilesByIds(userIds));
        }

        return {data: true};
    };
}

export function deleteCustomEmoji(emojiId: string): ActionFunc {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        try {
            await Client4.deleteCustomEmoji(emojiId);
        } catch (error) {
            forceLogoutIfNecessary(error, dispatch, getState);

            dispatch(logError(error));
            return {error};
        }

        dispatch({
            type: EmojiTypes.DELETED_CUSTOM_EMOJI,
            data: {id: emojiId},
        });

        return {data: true};
    };
}

export function searchCustomEmojis(term: string, options: any = {}, loadUsers = false): ActionFunc {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        let data;
        try {
            data = await Client4.searchCustomEmoji(term, options);
        } catch (error) {
            forceLogoutIfNecessary(error, dispatch, getState);

            dispatch(logError(error));
            return {error};
        }

        if (loadUsers) {
            dispatch(loadProfilesForCustomEmojis(data));
        }

        dispatch({
            type: EmojiTypes.RECEIVED_CUSTOM_EMOJIS,
            data,
        });

        return {data};
    };
}

export function autocompleteCustomEmojis(name: string): ActionFunc {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        let data;
        try {
            data = await Client4.autocompleteCustomEmoji(name);
        } catch (error) {
            forceLogoutIfNecessary(error, dispatch, getState);

            dispatch(logError(error));
            return {error};
        }

        dispatch({
            type: EmojiTypes.RECEIVED_CUSTOM_EMOJIS,
            data,
        });

        return {data};
    };
}
