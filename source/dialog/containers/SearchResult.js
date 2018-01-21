import { connect } from "react-redux";
import SearchResult from "../components/SearchResult.js";
import { getEntryResultPath, getEntryResultTitle, getEntryResultURL } from "../../shared/selectors/searching.js";
import { sendCredentialsToTab } from "../library/messaging.js";
import { closeDialog } from "../library/context.js";

export default connect(
    (state, ownProps) => ({
        path: getEntryResultPath(state, ownProps.sourceID, ownProps.entryID),
        title: getEntryResultTitle(state, ownProps.sourceID, ownProps.entryID),
        url: getEntryResultURL(state, ownProps.sourceID, ownProps.entryID)
    }),
    {
        onEnterDetailsRequest: (sourceID, entryID, signIn = false) => () => {
            sendCredentialsToTab(sourceID, entryID, signIn);
            closeDialog();
        }
    }
)(SearchResult);
