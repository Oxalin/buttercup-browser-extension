import { connect } from "react-redux";
import ArchivesListPage from "../components/ArchivesListPage.js";
// import { toggleMenu } from "../actions/popupMenu.js";
// import { getMenuState } from "../selectors/popupMenu.js";
import { getArchives } from "../../shared/selectors/archives.js";
import { createNewTab, getExtensionURL } from "../../shared/library/extension.js";

const NOOP = () => {};

export default connect(
    (state, ownProps) => ({
        archives: getArchives(state)
        // menuState: getMenuState(state)
    }),
    {
        // onAddArchiveClick: () => () => {
        //     createNewTab(getExtensionURL("setup.html#/add-archive"));
        // },
        onArchiveClick: (archiveID, state) => () => {
            createNewTab(getExtensionURL(`setup.html#/access-archive/${archiveID}/${state}`));
        }
        // onLockAllClick: () => () => {
        //     createNewTab(getExtensionURL("setup.html#/lock-archives"));
        // },
        // onMenuClick: () => dispatch => {
        //     dispatch(toggleMenu());
        // },
        // onOtherSoftwareClick: () => () => {
        //     createNewTab("https://buttercup.pw");
        // }
    }
)(ArchivesListPage);
