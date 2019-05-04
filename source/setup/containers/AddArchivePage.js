import { basename, dirname } from "path";
import { connect } from "react-redux";
import stripTags from "striptags";
import joinURL from "url-join";
import { createClient as createGoogleDriveClient } from "@buttercup/googledrive-client";
import AddArchivePage from "../components/AddArchivePage.js";
import {
    getLocalAuthKey,
    getLocalAuthStatus,
    getSelectedArchiveType,
    getSelectedFilename,
    isConnected,
    isConnecting,
    selectedFileNeedsCreation
} from "../selectors/addArchive.js";
import { getDirectoryContents } from "../selectors/remoteFiles.js";
import {
    createRemoteFile,
    selectRemoteFile,
    setAdding,
    setConnected,
    setConnecting,
    setLocalAuthKey,
    setLocalAuthStatus,
    setSelectedArchiveType
} from "../actions/addArchive.js";
import { connectWebDAV } from "../library/remote.js";
import { notifyError, notifySuccess } from "../library/notify.js";
import {
    addDropboxArchive,
    addGoogleDriveArchive,
    addLocalArchive,
    addNextcloudArchive,
    addOwnCloudArchive,
    addWebDAVArchive
} from "../library/archives.js";
import { setBusy, unsetBusy } from "../../shared/actions/app.js";
import { setAuthID as setGoogleDriveAuthID } from "../../shared/actions/googleDrive.js";
import { setAuthID as setDropboxAuthID } from "../../shared/actions/dropbox.js";
import { getAuthID as getDropboxAuthID, getAuthToken as getDropboxAuthToken } from "../../shared/selectors/dropbox.js";
import {
    getAuthID as getGoogleDriveAuthID,
    getAccessToken as getGoogleDriveAccessToken,
    getRefreshToken as getGoogleDriveRefeshToken
} from "../../shared/selectors/googleDrive";
import { performAuthentication as performMyButtercupAuthentication } from "../library/myButtercup.js";
import { setAuthID as setMyButtercupAuthID } from "../../shared/actions/myButtercup.js";
import {
    getAuthID as getMyButtercupAuthID,
    getAuthToken as getMyButtercupAuthToken
} from "../../shared/selectors/mybuttercup.js";
import { closeCurrentTab } from "../../shared/library/extension.js";
import {
    createNewClient as createLocalClient,
    receiveAuthKey as receiveLocalKey,
    requestConnection as requestLocalConnection
} from "../library/localFile.js";
import { authenticateGoogleDrive } from "../library/messaging.js";

const ADD_ARCHIVE_WINDOW_CLOSE_DELAY = 2000;

export default connect(
    (state, ownProps) => ({
        dropboxAuthID: getDropboxAuthID(state),
        dropboxAuthToken: getDropboxAuthToken(state),
        googleDriveAccessToken: getGoogleDriveAccessToken(state),
        googleDriveAuthID: getGoogleDriveAuthID(state),
        localAuthStatus: getLocalAuthStatus(state),
        isConnected: isConnected(state),
        isConnecting: isConnecting(state),
        myButtercupAuthID: getMyButtercupAuthID(state),
        myButtercupAuthToken: getMyButtercupAuthToken(state),
        selectedArchiveType: getSelectedArchiveType(state),
        selectedFilename: getSelectedFilename(state),
        selectedFilenameNeedsCreation: selectedFileNeedsCreation(state)
    }),
    {
        onAuthenticateDesktop: code => dispatch => {
            dispatch(setLocalAuthStatus("authenticating"));
            receiveLocalKey(code)
                .then(key => {
                    createLocalClient(key);
                    dispatch(setLocalAuthStatus("authenticated"));
                    dispatch(setLocalAuthKey(key));
                })
                .catch(err => {
                    dispatch(setLocalAuthStatus("idle"));
                    console.error(err);
                    notifyError(
                        "Failed authenticating with local endpoint",
                        `An error occurred when completing handshake: ${err.message}`
                    );
                });
        },
        onAuthenticateDropbox: dropboxAuthID => dispatch => {
            dispatch(setDropboxAuthID(dropboxAuthID));
            performDropboxAuthentication();
        },
        onAuthenticateGoogleDrive: googleDriveAuthID => dispatch => {
            dispatch(setGoogleDriveAuthID(googleDriveAuthID));
            authenticateGoogleDrive();
        },
        onAuthenticateMyButtercup: myButtercupAuthID => dispatch => {
            dispatch(setMyButtercupAuthID(myButtercupAuthID));
            performMyButtercupAuthentication();
        },
        onChooseDropboxBasedArchive: (archiveName, masterPassword) => (dispatch, getState) => {
            const name = stripTags(archiveName);
            if (/^[^\s]/.test(name) !== true) {
                notifyError("Failed selecting Dropbox vault", `Vault name is invalid: ${name}`);
                return;
            }
            const state = getState();
            const remoteFilename = getSelectedFilename(state);
            const shouldCreate = selectedFileNeedsCreation(state);
            const dropboxToken = getDropboxAuthToken(state);
            dispatch(setAdding(true));
            dispatch(setBusy(shouldCreate ? "Adding new vault..." : "Adding existing vault..."));
            return addDropboxArchive(name, masterPassword, remoteFilename, dropboxToken, shouldCreate)
                .then(() => {
                    dispatch(unsetBusy());
                    notifySuccess("Successfully added vault", `The vault '${archiveName}' was successfully added.`);
                    setTimeout(() => {
                        closeCurrentTab();
                    }, ADD_ARCHIVE_WINDOW_CLOSE_DELAY);
                })
                .catch(err => {
                    dispatch(unsetBusy());
                    console.error(err);
                    notifyError(
                        "Failed selecting Dropbox vault",
                        `An error occurred when adding the vault: ${err.message}`
                    );
                    dispatch(setAdding(false));
                });
        },
        onChooseGoogleDriveBasedArchive: (archiveName, masterPassword) => (dispatch, getState) => {
            const name = stripTags(archiveName);
            if (/^[^\s]/.test(name) !== true) {
                notifyError("Failed selecting Google Drive vault", `Vault name is invalid: ${name}`);
                return;
            }
            const state = getState();
            const remoteFilename = getSelectedFilename(state);
            const shouldCreate = selectedFileNeedsCreation(state);
            const googleDriveToken = getGoogleDriveAccessToken(state);
            const googleDriveRefreshToken = getGoogleDriveRefeshToken(state);
            dispatch(setAdding(true));
            dispatch(setBusy(shouldCreate ? "Adding new vault..." : "Adding existing vault..."));
            return Promise.resolve()
                .then(async () => {
                    let fileID;
                    if (shouldCreate) {
                        const client = createGoogleDriveClient(googleDriveToken);
                        const containingDirectory = dirname(remoteFilename);
                        const putOptions = {
                            contents: "\n",
                            name: basename(remoteFilename)
                        };
                        if (containingDirectory !== "/") {
                            const upperContainer = dirname(containingDirectory);
                            const containingDirectoryNode = getDirectoryContents(state, upperContainer).find(
                                node => node.type === "directory" && node.basename === basename(containingDirectory)
                            );
                            if (!containingDirectoryNode) {
                                throw new Error(`Failed to find Google node ID for parent of file: ${remoteFilename}`);
                            }
                            putOptions.parent = containingDirectoryNode.googleFileID;
                        }
                        fileID = await client.putFileContents(putOptions);
                    } else {
                        const remoteFiles = getDirectoryContents(state, dirname(remoteFilename));
                        const ourFile = remoteFiles.find(file => file.filename === remoteFilename);
                        if (!ourFile) {
                            throw new Error(`No matching file found for existing path: ${remoteFilename}`);
                        }
                        fileID = ourFile.googleFileID;
                    }
                    return addGoogleDriveArchive(
                        name,
                        masterPassword,
                        fileID,
                        googleDriveToken,
                        googleDriveRefreshToken,
                        shouldCreate
                    );
                })
                .then(() => {
                    dispatch(unsetBusy());
                    notifySuccess("Successfully added vault", `The vault '${archiveName}' was successfully added.`);
                    setTimeout(() => {
                        closeCurrentTab();
                    }, ADD_ARCHIVE_WINDOW_CLOSE_DELAY);
                })
                .catch(err => {
                    dispatch(unsetBusy());
                    console.error(err);
                    notifyError(
                        "Failed selecting Google Drive vault",
                        `An error occurred when adding the vault: ${err.message}`
                    );
                    dispatch(setAdding(false));
                });
        },
        onChooseLocallyBasedArchive: (archiveName, masterPassword) => (dispatch, getState) => {
            const name = stripTags(archiveName);
            if (/^[^\s]/.test(name) !== true) {
                notifyError(`Failed selecting ${type} vault`, `Vault name is invalid: ${name}`);
                return;
            }
            const state = getState();
            const remoteFilename = getSelectedFilename(state);
            const shouldCreate = selectedFileNeedsCreation(state);
            const key = getLocalAuthKey(state);
            dispatch(setAdding(true));
            dispatch(setBusy(shouldCreate ? "Adding new vault..." : "Adding existing vault..."));
            return addLocalArchive(name, masterPassword, remoteFilename, key, shouldCreate)
                .then(() => {
                    dispatch(unsetBusy());
                    notifySuccess("Successfully added vault", `The vault '${archiveName}' was successfully added.`);
                    setTimeout(() => {
                        closeCurrentTab();
                    }, ADD_ARCHIVE_WINDOW_CLOSE_DELAY);
                })
                .catch(err => {
                    dispatch(unsetBusy());
                    console.error(err);
                    notifyError(
                        "Failed selecting local vault",
                        `An error occurred when adding the vault: ${err.message}`
                    );
                    dispatch(setAdding(false));
                });
        },
        onChooseWebDAVBasedArchive: (type, archiveName, masterPassword, url, username, password) => (
            dispatch,
            getState
        ) => {
            const name = stripTags(archiveName);
            if (/^[^\s]/.test(name) !== true) {
                notifyError(`Failed selecting ${type} vault`, `Vault name is invalid: ${name}`);
                return;
            }
            const state = getState();
            const remoteFilename = getSelectedFilename(state);
            const shouldCreate = selectedFileNeedsCreation(state);
            let addArchive;
            switch (type) {
                case "nextcloud":
                    addArchive = addNextcloudArchive;
                    break;
                case "owncloud":
                    addArchive = addOwnCloudArchive;
                    break;
                case "webdav":
                    addArchive = addWebDAVArchive;
                    break;
                default:
                    console.error(`Unable to add vault: Invalid vault type: ${type}`);
                    notifyError("Failed adding vault", `An error occurred when adding the vault: ${err.message}`);
                    return;
            }
            dispatch(setAdding(true));
            dispatch(setBusy(shouldCreate ? "Adding new vault..." : "Adding existing vault..."));
            return addArchive(name, masterPassword, remoteFilename, url, username, password, shouldCreate)
                .then(() => {
                    dispatch(unsetBusy());
                    notifySuccess("Successfully added vault", `The vault '${archiveName}' was successfully added.`);
                    setTimeout(() => {
                        closeCurrentTab();
                    }, ADD_ARCHIVE_WINDOW_CLOSE_DELAY);
                })
                .catch(err => {
                    dispatch(unsetBusy());
                    console.error(err);
                    notifyError(
                        `Failed selecting ${type} vault`,
                        `An error occurred when adding the vault: ${err.message}`
                    );
                    dispatch(setAdding(false));
                });
        },
        onConnectDesktop: () => dispatch => {
            dispatch(setConnecting(true));
            requestLocalConnection()
                .then(() => {
                    dispatch(setConnecting(false));
                    dispatch(setConnected(true));
                })
                .catch(err => {
                    dispatch(setConnecting(false));
                    console.error(err);
                    notifyError("Failed connecting local vault", `An error occurred when connecting: ${err.message}`);
                });
        },
        onConnectWebDAVBasedSource: (type, url, username, password) => dispatch => {
            let webdavURL;
            switch (type) {
                case "owncloud":
                /* falls-through */
                case "nextcloud":
                    webdavURL = joinURL(url, "/remote.php/webdav");
                    break;
                default:
                    webdavURL = url;
                    break;
            }
            dispatch(setConnecting(true));
            setTimeout(() => {
                connectWebDAV(webdavURL, username, password)
                    .then(() => {
                        dispatch(setConnected(true));
                        dispatch(setConnecting(false));
                    })
                    .catch(err => {
                        console.error(err);
                        notifyError(
                            `Failed connecting to '${type}' resource`,
                            `A connection attempt to '${url}' has failed: ${err.message}`
                        );
                    });
            }, 750);
        },
        onCreateRemotePath: filename => dispatch => {
            dispatch(createRemoteFile(filename));
        },
        onReady: () => dispatch => {
            dispatch(setAdding(false));
            dispatch(setSelectedArchiveType(null));
        },
        onSelectRemotePath: filename => dispatch => {
            dispatch(selectRemoteFile(filename));
        }
    }
)(AddArchivePage);
