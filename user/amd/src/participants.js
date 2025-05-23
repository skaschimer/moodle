// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Some UI stuff for participants page.
 * This is also used by the report/participants/index.php because it has the same functionality.
 *
 * @module     core_user/participants
 * @copyright  2017 Damyon Wiese
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import * as DynamicTable from 'core_table/dynamic';
import * as Str from 'core/str';
import CheckboxToggleAll from 'core/checkbox-toggleall';
import CustomEvents from 'core/custom_interaction_events';
import DynamicTableSelectors from 'core_table/local/dynamic/selectors';
import ModalEvents from 'core/modal_events';
import Notification from 'core/notification';
import Pending from 'core/pending';
import jQuery from 'jquery';
import {showAddNote, showSendMessage} from 'core_user/local/participants/bulkactions';
import 'core/inplace_editable';

const Selectors = {
    bulkActionSelect: "#formactionid",
    bulkUserSelectedCheckBoxes: "input[data-togglegroup='participants-table'][data-toggle='target']:checked",
    checkCountButton: "#checkall",
    showCountText: '[data-region="participant-count"]',
    showCountToggle: '[data-action="showcount"]',
    stateHelpIcon: '[data-region="state-help-icon"]',
    tableForm: uniqueId => `form[data-table-unique-id="${uniqueId}"]`,
};

export const init = ({
    uniqueid,
    noteStateNames = {},
}) => {
    const root = document.querySelector(Selectors.tableForm(uniqueid));
    const getTableFromUniqueId = uniqueId => root.querySelector(DynamicTableSelectors.main.fromRegionId(uniqueId));

    /**
     * Private method.
     *
     * @method registerEventListeners
     * @private
     */
    const registerEventListeners = () => {
        CustomEvents.define(Selectors.bulkActionSelect, [CustomEvents.events.accessibleChange]);
        jQuery(Selectors.bulkActionSelect).on(CustomEvents.events.accessibleChange, e => {
            const bulkActionSelect = e.target.closest('select');
            const action = bulkActionSelect.value;
            const tableRoot = getTableFromUniqueId(uniqueid);
            const checkboxes = tableRoot.querySelectorAll(Selectors.bulkUserSelectedCheckBoxes);
            const pendingPromise = new Pending('core_user/participants:bulkActionSelect');

            if (action.indexOf('#') !== -1) {
                e.preventDefault();

                const ids = [];
                checkboxes.forEach(checkbox => {
                    ids.push(checkbox.getAttribute('name').replace('user', ''));
                });

                let bulkAction;
                if (action === '#messageselect') {
                    bulkAction = showSendMessage(ids);
                } else if (action === '#addgroupnote') {
                    bulkAction = showAddNote(
                        root.dataset.courseId,
                        ids,
                        noteStateNames,
                        root.querySelector(Selectors.stateHelpIcon)
                    );
                }

                if (bulkAction) {
                    const pendingBulkAction = new Pending('core_user/participants:bulkActionSelected');
                    bulkAction
                    .then(modal => {
                        modal.getRoot().on(ModalEvents.hidden, () => {
                            // Focus on the action select when the dialog is closed.
                            bulkActionSelect.focus();
                        });

                        pendingBulkAction.resolve();
                        return modal;
                    })
                    .catch(Notification.exception);
                }
            } else if (action !== '' && checkboxes.length) {
                bulkActionSelect.form.submit();
            }

            resetBulkAction(bulkActionSelect);
            pendingPromise.resolve();
        });

        root.addEventListener('click', e => {
            // Handle clicking of the "Select all" actions.
            const checkCountButton = root.querySelector(Selectors.checkCountButton);
            const checkCountButtonClicked = checkCountButton && checkCountButton.contains(e.target);

            if (checkCountButtonClicked) {
                e.preventDefault();

                const tableRoot = getTableFromUniqueId(uniqueid);

                DynamicTable.setPageSize(tableRoot, checkCountButton.dataset.targetPageSize)
                .then(tableRoot => {
                    // Update the toggle state.
                    CheckboxToggleAll.setGroupState(root, 'participants-table', true);

                    return tableRoot;
                })
                .catch(Notification.exception);
            }
        });

        // When the content is refreshed, update the row counts in various places.
        root.addEventListener(DynamicTable.Events.tableContentRefreshed, e => {
            const checkCountButton = root.querySelector(Selectors.checkCountButton);

            const tableRoot = e.target;

            const defaultPageSize = parseInt(tableRoot.dataset.tableDefaultPerPage, 10);
            const currentPageSize = parseInt(tableRoot.dataset.tablePageSize, 10);
            const totalRowCount = parseInt(tableRoot.dataset.tableTotalRows, 10);

            CheckboxToggleAll.updateTargetsFromTogglerState(root, 'participants-table');

            const pageCountStrings = [
                {
                    key: 'countparticipantsfound',
                    component: 'core_user',
                    param: totalRowCount,
                },
            ];

            if (totalRowCount <= defaultPageSize) {
                if (checkCountButton) {
                    checkCountButton.classList.add('hidden');
                }
            } else if (totalRowCount <= currentPageSize) {
                // The are fewer than the current page size.
                pageCountStrings.push({
                    key: 'selectalluserswithcount',
                    component: 'core',
                    param: defaultPageSize,
                });

                if (checkCountButton) {
                    // The 'Check all [x]' button is only visible when there are values to set.
                    checkCountButton.classList.add('hidden');
                }
            } else {
                pageCountStrings.push({
                    key: 'selectalluserswithcount',
                    component: 'core',
                    param: totalRowCount,
                });

                if (checkCountButton) {
                    checkCountButton.classList.remove('hidden');
                }
            }

            Str.get_strings(pageCountStrings)
            .then(([showingParticipantCountString, selectCountString]) => {
                const showingParticipantCount = root.querySelector(Selectors.showCountText);
                showingParticipantCount.innerHTML = showingParticipantCountString;

                if (selectCountString && checkCountButton) {
                    checkCountButton.value = selectCountString;
                }

                return;
            })
            .catch(Notification.exception);
        });
    };

    const resetBulkAction = bulkActionSelect => {
        bulkActionSelect.value = '';
    };

    registerEventListeners();
};
