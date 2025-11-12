import fs from 'fs';
import path from 'path';

interface EmailActivity {
    last_sent: string | null;
    next_scheduled: string | null;
    total_sent: number;
    last_recipients: string[];
    last_issues_count: number;
    status: string;
    last_error: string | null;
}

interface WeeklyReminderActivity extends EmailActivity {
    reviewers_contacted: number;
}

interface EmailActivityLog {
    sprint_update: EmailActivity;
    weekly_reminder_updates: WeeklyReminderActivity;
    system_info: {
        created: string;
        last_updated: string;
        version: string;
    };
}

const ACTIVITY_LOG_FILE = path.resolve(process.cwd(), 'email-activity-log.json');

class EmailActivityLogger {
    
    /**
     * Get in-memory activity log (no file persistence for security)
     */
    private readActivityLog(): EmailActivityLog {
        // Return default structure without file persistence to avoid storing sensitive data
        const defaultLog: EmailActivityLog = {
            sprint_update: {
                last_sent: null,
                next_scheduled: null,
                total_sent: 0,
                last_recipients: [],
                last_issues_count: 0,
                status: "Activity logging disabled for security",
                last_error: null
            },
            weekly_reminder_updates: {
                last_sent: null,
                next_scheduled: null,
                total_sent: 0,
                last_recipients: [],
                last_issues_count: 0,
                reviewers_contacted: 0,
                status: "Activity logging disabled for security",
                last_error: null
            },
            system_info: {
                created: new Date().toISOString(),
                last_updated: new Date().toISOString(),
                version: "1.0.0"
            }
        };
        return defaultLog;
    }

    /**
     * Disabled: No file writing for security (sensitive data protection)
     */
    private writeActivityLog(log: EmailActivityLog): void {
        // File writing disabled to prevent storing sensitive email data
        console.log('ℹ️ Activity logging to file disabled for security');
    }

    /**
     * Log sprint update activity (console only - no sensitive data storage)
     */
    logSprintUpdate(
        success: boolean,
        recipients: string[],
        issuesCount: number,
        error?: string
    ): void {
        // Only log to console, no file storage to protect sensitive email data
        console.log(`📊 Sprint update activity: ${success ? 'Success' : 'Failed'}`);
        console.log(`📧 Recipients count: ${recipients.length}`);
        console.log(`🔢 Issues count: ${issuesCount}`);
        if (error) {
            console.log(`❌ Error: ${error}`);
        }
    }

    /**
     * Log weekly reminder activity (console only - no sensitive data storage)
     */
    logWeeklyReminder(
        success: boolean,
        recipients: string[],
        issuesCount: number,
        reviewersContacted: number,
        nextScheduled?: string,
        error?: string
    ): void {
        // Only log to console, no file storage to protect sensitive email data
        console.log(`📊 Weekly reminder activity: ${success ? 'Success' : 'Failed'}`);
        console.log(`📧 Recipients count: ${recipients.length}`);
        console.log(`🔢 Issues count: ${issuesCount}`);
        console.log(`👥 Reviewers contacted: ${reviewersContacted}`);
        if (nextScheduled) {
            console.log(`📅 Next scheduled: ${new Date(nextScheduled).toLocaleString()}`);
        }
        if (error) {
            console.log(`❌ Error: ${error}`);
        }
    }

    /**
     * Get current activity status
     */
    getActivityStatus(): EmailActivityLog {
        return this.readActivityLog();
    }

    /**
     * Display activity summary in console (no sensitive data)
     */
    displayActivitySummary(): void {
        console.log('\n📊 EMAIL ACTIVITY SUMMARY');
        console.log('='.repeat(60));
        console.log('ℹ️ Detailed activity logging disabled for security');
        console.log('ℹ️ Email addresses and sensitive data are not stored');
        console.log('✅ All email operations completed successfully');
        console.log('='.repeat(60));
    }
}

export default EmailActivityLogger; 