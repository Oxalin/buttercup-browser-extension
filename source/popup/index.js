import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { Route } from "react-router";
import { ConnectedRouter } from "react-router-redux";
import store from "./redux/index.js";
import history from "./redux/history.js";
import { connectToBackground } from "./library/messaging.js";
import ArchivesListPage from "./containers/ArchivesListPage.js";

import "../shared/styles/base.sass";
import "./styles/popup.sass";
import "../../resources/fontawesome/font-awesome.scss";

connectToBackground();

ReactDOM.render(
    <Provider store={store}>
        <ConnectedRouter history={history}>
            <div>
                <Route exact path="/" component={ArchivesListPage} />
            </div>
        </ConnectedRouter>
    </Provider>,
    document.getElementById("root")
);
