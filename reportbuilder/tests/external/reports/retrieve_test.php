<?php
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

declare(strict_types=1);

namespace core_reportbuilder\external\reports;

use core_customfield_generator;
use core_reportbuilder_generator;
use core_external\external_api;
use externallib_advanced_testcase;
use core_reportbuilder\exception\report_access_exception;
use core_user\reportbuilder\datasource\users;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once("{$CFG->dirroot}/webservice/tests/helpers.php");

/**
 * Unit tests of external class for retrieving custom report content
 *
 * @package     core_reportbuilder
 * @covers      \core_reportbuilder\external\reports\retrieve
 * @copyright   2022 Paul Holden <paulh@moodle.com>
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class retrieve_test extends externallib_advanced_testcase {

    /**
     * Text execute method
     */
    public function test_execute(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $this->getDataGenerator()->create_user(['firstname' => 'Zoe', 'lastname' => 'Zebra', 'email' => 'u1@example.com']);
        $this->getDataGenerator()->create_user(['firstname' => 'Charlie', 'lastname' => 'Carrot', 'email' => 'u2@example.com']);

        /** @var core_customfield_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_customfield');
        $category = $generator->create_category(['component' => 'core_reportbuilder', 'area' => 'report']);
        $generator->create_field([
            'categoryid' => $category->get('id'),
            'name' => 'My field',
            'shortname' => 'myfield',
            'type' => 'number',
        ]);

        /** @var core_reportbuilder_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_reportbuilder');

        $report = $generator->create_report([
            'name' => 'My report',
            'source' => users::class,
            'default' => false,
            'tags' => ['cat', 'dog'],
            'customfield_myfield' => 42,
        ]);
        $generator->create_column(['reportid' => $report->get('id'), 'uniqueidentifier' => 'user:fullname', 'sortenabled' => 1]);
        $generator->create_column(['reportid' => $report->get('id'), 'uniqueidentifier' => 'user:email']);

        // There are three users (admin plus the two previouly created), but we're paging the first two only.
        $result = retrieve::execute($report->get('id'), 0, 2);
        $result = external_api::clean_returnvalue(retrieve::execute_returns(), $result);

        // All data is generated by exporters, just assert relevant sample of each.
        $this->assertArrayHasKey('details', $result);
        $this->assertEquals('My report', $result['details']['name']);
        $this->assertEquals(['cat', 'dog'], array_column($result['details']['tags'], 'name'));

        $this->assertArrayHasKey('data', $result);
        $this->assertEquals(['Full name', 'Email address'], $result['data']['headers']);
        $this->assertEquals([
            [
                'columns' => ['Admin User', 'admin@example.com'],
            ],
            [
                'columns' => ['Charlie Carrot', 'u2@example.com'],
            ],
        ], $result['data']['rows']);
        $this->assertEquals(3, $result['data']['totalrowcount']);
        $this->assertEmpty($result['warnings']);

        // Retrieve the second set of pages results.
        $result = retrieve::execute($report->get('id'), 1, 2);
        $result = external_api::clean_returnvalue(retrieve::execute_returns(), $result);

        // All data is generated by exporters, just assert relevant sample of each.
        $this->assertArrayHasKey('details', $result);
        $this->assertEquals('My report', $result['details']['name']);
        $this->assertEquals(['cat', 'dog'], array_column($result['details']['tags'], 'name'));
        $this->assertEquals(['42'], array_column($result['details']['customfields']['data'], 'value'));

        $this->assertArrayHasKey('data', $result);
        $this->assertEquals(['Full name', 'Email address'], $result['data']['headers']);
        $this->assertEquals([
            [
                'columns' => ['Zoe Zebra', 'u1@example.com'],
            ],
        ], $result['data']['rows']);
        $this->assertEquals(3, $result['data']['totalrowcount']);
        $this->assertEmpty($result['warnings']);
    }

    /**
     * Test execute method for a user without permission to view report
     */
    public function test_execute_access_exception(): void {
        $this->resetAfterTest();

        /** @var core_reportbuilder_generator $generator */
        $generator = $this->getDataGenerator()->get_plugin_generator('core_reportbuilder');
        $report = $generator->create_report(['name' => 'My report', 'source' => users::class]);

        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);

        $this->expectException(report_access_exception::class);
        $this->expectExceptionMessage('You cannot view this report');
        retrieve::execute($report->get('id'));
    }
}
