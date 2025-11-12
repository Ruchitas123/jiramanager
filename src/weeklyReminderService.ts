import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JiraService, { JiraIssue } from './jiraService.js';
import EmailActivityLogger from './emailActivityLogger.js';
import { queryAd } from './ldap.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ override: true });

// Interface for reviewer data
interface ReviewerData {
    email: string;
    name: string;
    issues: JiraIssue[];
}

// Interface for tracking weekly reminders
interface WeeklyReminderState {
    lastReminderDate: string;
    nextReminderDate: string;
}

const REMINDER_STATE_FILE = path.resolve(process.cwd(), 'weekly-reminder-state.json');

class WeeklyReminderService {
    private jiraService: JiraService;
    private activityLogger: EmailActivityLogger;

    constructor() {
        this.jiraService = new JiraService();
        this.activityLogger = new EmailActivityLogger();
    }

    /**
     * Check if it's time to send weekly reminders
     */
    private shouldSendReminder(): boolean {
        try {
            if (!fs.existsSync(REMINDER_STATE_FILE)) {
                console.log('📅 No previous reminder state found. This is the first run.');
                return true;
            }

            const stateData = fs.readFileSync(REMINDER_STATE_FILE, 'utf8');
            const state: WeeklyReminderState = JSON.parse(stateData);
            
            const now = new Date();
            const nextReminderDate = new Date(state.nextReminderDate);
            
            console.log(`📅 Current time: ${now.toISOString()}`);
            console.log(`📅 Next reminder scheduled for: ${nextReminderDate.toISOString()}`);
            
            return now >= nextReminderDate;
        } catch (error) {
            console.error('❌ Error reading reminder state:', error);
            return true; // Default to sending reminder if state is corrupted
        }
    }

    /**
     * Update the reminder state after sending
     */
    private updateReminderState(): void {
        try {
            const now = new Date();
            const nextWeek = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days from now
            
            const state: WeeklyReminderState = {
                lastReminderDate: now.toISOString(),
                nextReminderDate: nextWeek.toISOString()
            };
            
            fs.writeFileSync(REMINDER_STATE_FILE, JSON.stringify(state, null, 2));
            console.log(`📅 Next weekly reminder scheduled for: ${nextWeek.toLocaleString()}`);
        } catch (error) {
            console.error('❌ Error updating reminder state:', error);
        }
    }

    /**
     * Get all issues that need review (status contains "review" case-insensitive)
     */
    private async getReviewIssues(): Promise<JiraIssue[]> {
        const rapidViewId = process.env.JIRA_RAPID_VIEW || '44313';
        console.log(`🔍 Fetching issues for review from board ${rapidViewId}...`);

        try {
            // Get active sprint issues first, fallback to all board issues
            let allIssues = await this.jiraService.getActiveSprintIssues(rapidViewId);
            
            if (allIssues.length === 0) {
                console.log('📋 No active sprint found, fetching all board issues...');
                allIssues = await this.jiraService.getBoardIssues(rapidViewId);
            }

            // Filter issues that need review (status contains "review" case-insensitive)
            const reviewIssues = allIssues.filter(issue => 
                issue.status.toLowerCase().includes('review') || 
                issue.status.toLowerCase().includes('to review')
            );

            console.log(`✅ Found ${reviewIssues.length} issues requiring review out of ${allIssues.length} total issues`);

            return reviewIssues;
        } catch (error) {
            console.error('❌ Error fetching review issues:', error);
            throw error;
        }
    }

    /**
     * Group issues by assignee (reviewer) using email
     */
    private groupIssuesByReviewer(issues: JiraIssue[]): Map<string, JiraIssue[]> {
        const reviewerMap = new Map<string, JiraIssue[]>();

        issues.forEach(issue => {
            // Use assigneeEmail if available, otherwise fall back to assignee display name
            const reviewerKey = issue.assigneeEmail || issue.assignee || 'Unassigned';
            if (!reviewerMap.has(reviewerKey)) {
                reviewerMap.set(reviewerKey, []);
            }
            reviewerMap.get(reviewerKey)!.push(issue);
        });

        return reviewerMap;
    }

    /**
     * Format issues for summary display (matching sprint update format)
     */
    private formatIssuesSummary(issues: JiraIssue[]): string {
        // Count issues by status
        const statusCount = issues.reduce((acc: Record<string, number>, issue) => {
            acc[issue.status] = (acc[issue.status] || 0) + 1;
            return acc;
        }, {});

        // Create summary text with each status on a new line
        const summaryLines = [
            `Total issues: ${issues.length}`,
            'Issues by Status:'
        ];
        for (const [status, count] of Object.entries(statusCount)) {
            summaryLines.push(`${status}: ${count} issues`);
        }
        
        return summaryLines.join('\n');
    }

    /**
     * Format email content for console display
     */
    private formatEmailContentForConsole(reviewerName: string, issues: JiraIssue[], allRecipients: string[]): string {
        const issueCount = issues.length;
        const issuesTable = issues.map(issue => 
            `${issue.key}\t${issue.summary}\t${issue.assignee}\t${issue.status}`
        ).join('\n');
        
        // Split recipients into TO and CC for display
        const reviewerEmail = this.getReviewerEmail(reviewerName);
        const ccEmails = allRecipients.filter(email => email !== reviewerEmail);
        
        return `
📨 TO: ${reviewerEmail || 'Email could not be determined'} (${reviewerName})
📄 CC: ${ccEmails.length > 0 ? ccEmails.join(', ') + ' (Doc Team)' : 'None'}
Subject: Gentle Reminder!
Issues Count: ${issueCount}

ISSUES REQUIRING REVIEW BY ${reviewerName.toUpperCase()}:
Issue\t\tTitle\t\t\t\t\tAssignee\t\tStatus
${'-'.repeat(80)}
${issuesTable}
${'='.repeat(80)}
⚠️ NOTE: This is a weekly reminder email!
`;
    }

    /**
     * Convert reviewer name to email address
     */
    private getReviewerEmail(reviewerName: string): string | null {
        // Handle common name patterns and convert to email
        const name = reviewerName.trim();
        
        // Skip unassigned items
        if (name.toLowerCase() === 'unassigned' || !name) {
            return null;
        }
        
        try {
            // Convert "First Last" to "first.last@adobe.com"
            const emailName = name
                .toLowerCase()
                .replace(/\s+/g, '.')
                .replace(/[^a-z0-9.]/g, ''); // Remove special characters
            
            return `${emailName}@adobe.com`;
        } catch (error) {
            console.warn(`⚠️ Could not convert reviewer name "${reviewerName}" to email address`);
            return null;
        }
    }

    /**
     * Get manager information from LDAP using reviewer email
     */
    private async getReviewerDetailsFromLDAP(reviewerEmail: string): Promise<{actualEmail: string | null, managerEmail: string | null}> {
        try {
            console.log(`🔍 Looking up LDAP details for email: ${reviewerEmail}...`);
            
            // First try exact email search
            let ldapResult = await queryAd("search_users", {
                search_term: reviewerEmail,
                exact: true
            });
            
            // If exact email fails, try searching by the first part of the email (username)
            if (!ldapResult.data || (Array.isArray(ldapResult.data) && ldapResult.data.length === 0)) {
                const username = reviewerEmail.split('@')[0];
                console.log(`🔍 Retrying LDAP search with username: ${username}...`);
                
                ldapResult = await queryAd("search_users", {
                    search_term: username,
                    exact: false  // Use partial matching for username
                });
            }
            
            if (ldapResult.status === 'success' && ldapResult.data && (Array.isArray(ldapResult.data) ? ldapResult.data.length > 0 : true)) {
                const userData = Array.isArray(ldapResult.data) ? ldapResult.data[0] : ldapResult.data;
                const managerDN = userData?.manager;
                
                // Print the actual email found in LDAP
                console.log(`📧 Found actual email in LDAP: ${userData?.email}`);
                
                let managerEmail: string | null = null;
                
                if (managerDN && managerDN !== 'N/A') {
                    // Extract manager username from DN format like "CN=khsingh,CN=Users,DC=adobenet,DC=global,DC=adobe,DC=com"
                    const managerUsername = this.extractUsernameFromDN(managerDN);
                    if (managerUsername) {
                        // Look up manager's email
                        try {
                            const managerResult = await queryAd("search_users", {
                                search_term: managerUsername,
                                exact: true
                            });
                            
                            if (managerResult.status === 'success' && managerResult.data) {
                                const managerData = Array.isArray(managerResult.data) ? managerResult.data[0] : managerResult.data;
                                managerEmail = managerData?.email;
                                console.log(`👔 Found manager email: ${managerEmail} for reviewer ${reviewerEmail}`);
                            }
                        } catch (managerError) {
                            console.warn(`⚠️ Could not lookup manager details for ${managerUsername}:`, managerError);
                        }
                    }
                }
                
                console.log(`✅ LDAP lookup successful for ${reviewerEmail}`);
                return {
                    actualEmail: userData?.email || null,
                    managerEmail
                };
            } else {
                console.warn(`⚠️ No LDAP data found for email: ${reviewerEmail}`);
                return {
                    actualEmail: null,
                    managerEmail: null
                };
            }
        } catch (error) {
            console.warn(`⚠️ LDAP lookup failed for email ${reviewerEmail}:`, error);
            return {
                actualEmail: null,
                managerEmail: null
            };
        }
    }

    /**
     * Extract username from LDAP DN format
     */
    private extractUsernameFromDN(dn: string): string | null {
        try {
            // Extract CN value from DN like "CN=khsingh,CN=Users,DC=adobenet,DC=global,DC=adobe,DC=com"
            const cnMatch = dn.match(/CN=([^,]+)/i);
            if (cnMatch && cnMatch[1]) {
                return cnMatch[1].trim();
            }
            return null;
        } catch (error) {
            console.warn(`⚠️ Could not extract username from DN: ${dn}`, error);
            return null;
        }
    }

    /**
     * Remove duplicate emails from array
     */
    private removeDuplicateEmails(emails: string[]): string[] {
        return [...new Set(emails.filter(email => email && email.trim() !== ''))];
    }

    /**
     * Send reminder email to a specific reviewer
     */
    private async sendReminderToReviewer(reviewerName: string, issues: JiraIssue[]): Promise<void> {
        let ccRecipients: string[] = [];
        
        try {
            console.log(`📧 Preparing reminder email for ${reviewerName}...`);

            // Create transporter using existing SMTP settings
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_SERVER,
                port: Number(process.env.SMTP_PORT),
                secure: process.env.USE_SSL === 'true',
                auth: {
                    user: process.env.smtp_username,
                    pass: process.env.EMAIL_PASSWORD
                },
                tls: {
                    rejectUnauthorized: false
                },
                connectionTimeout: 60000,
                greetingTimeout: 30000,
                socketTimeout: 60000
            });

            // Determine if reviewerName is already an email or display name
            let reviewerEmail: string;
            let reviewerDisplayName: string;
            
            if (reviewerName.includes('@')) {
                // reviewerName is already an email
                reviewerEmail = reviewerName;
                // Get display name from the first issue's assignee
                reviewerDisplayName = issues[0]?.assignee || reviewerName;
            } else {
                // reviewerName is a display name, convert to email
                reviewerDisplayName = reviewerName;
                const convertedEmail = this.getReviewerEmail(reviewerName);
                if (!convertedEmail) {
                    console.log(`⚠️ Could not determine email address for reviewer "${reviewerName}". Skipping.`);
                    return;
                }
                reviewerEmail = convertedEmail;
            }

            // Print reviewer email to console as requested
            console.log(`👤 Reviewer Email: ${reviewerEmail}`);

            // Get manager details from LDAP using reviewer email
            const ldapDetails = await this.getReviewerDetailsFromLDAP(reviewerEmail);
            const { actualEmail, managerEmail } = ldapDetails;
            
            // Use the actual email from LDAP if available, otherwise use the generated one
            const finalReviewerEmail = actualEmail || reviewerEmail;
            console.log(`📧 Final Reviewer Email: ${finalReviewerEmail}`);

            // Build CC recipients list
            ccRecipients = [
                process.env.Doc_Email1,
                process.env.Doc_Email2,
                process.env.Doc_Email3,
                process.env.CC_EMAIL
            ].filter((email): email is string => email !== undefined && email.trim() !== '');

            // Add manager to CC if found and not already in TO or CC
            if (managerEmail) {
                console.log(`👔 Adding manager to CC: ${managerEmail}`);
                ccRecipients.push(managerEmail);
            }

            // Remove duplicates and exclude the TO recipient from CC
            ccRecipients = this.removeDuplicateEmails(ccRecipients.filter(email => email !== finalReviewerEmail));

            console.log(`📬 Sending reminder email to ${reviewerDisplayName} (${issues.length} issue${issues.length > 1 ? 's' : ''})`);
            
            // Display email content structure
            console.log(`\n📧 EMAIL CONTENT FOR ${reviewerDisplayName.toUpperCase()}:`);
            console.log(`📨 TO: ${finalReviewerEmail} (${reviewerDisplayName})`);
            if (ccRecipients.length > 0) {
                console.log(`📄 CC: ${ccRecipients.join(', ')} ${managerEmail ? '(Doc Team + Manager + Additional CC)' : '(Doc Team + Additional CC)'}`);
            }
            console.log(`📋 Subject: Gentle Reminder!`);
            console.log(`🔍 Issues Count: ${issues.length}`);
            console.log(`\nISSUES REQUIRING REVIEW BY ${reviewerDisplayName.toUpperCase()}:`);
            console.log(`Issue\t\tTitle\t\t\t\t\tAssignee\t\tStatus`);
            console.log('-'.repeat(80));
            issues.forEach(issue => {
                console.log(`${issue.key}\t${issue.summary.length > 40 ? issue.summary.substring(0, 40) + '...' : issue.summary}\t${issue.assignee}\t${issue.status}`);
            });
            console.log('='.repeat(80));

            const issueCount = issues.length;
            const summary = this.formatIssuesSummary(issues);

            const mailOptions = {
                from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
                to: finalReviewerEmail,
                cc: ccRecipients.length > 0 ? ccRecipients.join(',') : undefined,
                subject: 'Gentle Reminder!',
                text: `Gentle Reminder!

Hello ${reviewerDisplayName},

Summary
${summary}

Below are the issues requiring your review:

Issues Requiring Your Review:
Issue\t\tTitle\t\t\t\t\tAssignee\t\tStatus
${'-'.repeat(80)}
${issues.map(issue => `${issue.key}\t${issue.summary}\t${issue.assignee}\t${issue.status}`).join('\n')}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Gentle Reminder!</title>
                    </head>
                    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
                        
                        <!-- Header -->
                        <div style="background: #ff5722; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: left;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 600;">Gentle Reminder!</h1>
                        </div>
                        
                        <!-- Main Content Container -->
                        <div style="background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                            
                            <!-- Greeting Section -->
                            <div style="padding: 30px; border-bottom: 1px solid #e1e5e9;">
                                <h2 style="color: #172b4d; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Hello ${reviewerDisplayName},</h2>
                                <div style="background-color: #f4f5f7; padding: 20px; border-radius: 6px; border-left: 4px solid #ff5722;">
                                    <pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; white-space: pre-wrap; color: #42526e; font-size: 14px; line-height: 1.5;">${summary}</pre>
                                </div>
                            </div>
                            
                            <!-- Issues Section -->
                            <div style="padding: 30px;">
                                <p style="margin: 0 0 20px 0; color: #42526e; font-size: 14px;">Below are the issues requiring your review:</p>
                                
                                <h2 style="color: #ff5722; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">Issues Requiring Your Review</h2>
                                
                                <!-- Issues Table - Optimized for Email Clients -->
                                <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px; border: 2px solid #dfe1e6;" cellpadding="0" cellspacing="0">
                                    <thead>
                                        <tr style="background-color: #f4f5f7;">
                                            <th style="border: 1px solid #dfe1e6; padding: 12px; text-align: left; font-weight: bold; color: #172b4d; font-size: 14px;">Issue</th>
                                            <th style="border: 1px solid #dfe1e6; padding: 12px; text-align: left; font-weight: bold; color: #172b4d; font-size: 14px;">Title</th>
                                            <th style="border: 1px solid #dfe1e6; padding: 12px; text-align: left; font-weight: bold; color: #172b4d; font-size: 14px;">Assignee</th>
                                            <th style="border: 1px solid #dfe1e6; padding: 12px; text-align: left; font-weight: bold; color: #172b4d; font-size: 14px;">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${issues.map((issue: JiraIssue, index: number) => `
                                        <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f9fafc'};">
                                            <td style="border: 1px solid #dfe1e6; padding: 12px; vertical-align: top;">
                                                <a href="https://jira.corp.adobe.com/browse/${issue.key}" style="color: #ff5722; text-decoration: none; font-weight: bold; font-size: 14px;">${issue.key}</a>
                                            </td>
                                            <td style="border: 1px solid #dfe1e6; padding: 12px; color: #172b4d; font-size: 14px; vertical-align: top;">${issue.summary}</td>
                                            <td style="border: 1px solid #dfe1e6; padding: 12px; color: #42526e; font-size: 14px; vertical-align: top;">${issue.assignee}</td>
                                            <td style="border: 1px solid #dfe1e6; padding: 12px; color: #42526e; font-size: 14px; vertical-align: top;">${issue.status}</td>
                                        </tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div style="text-align: center; margin-top: 20px; padding: 20px; color: #6b778c; font-size: 12px;">
                            <p style="margin: 5px 0 0 0;">📅 Sent on ${new Date().toLocaleDateString()}</p>
                        </div>
                    </body>
                    </html>
                `
            };

            console.log(`📤 Sending weekly reminder email...`);
            
            const info = await transporter.sendMail(mailOptions);
            
            console.log('✅ Weekly reminder email sent successfully!');
            console.log(`📧 Message ID: ${info.messageId}`);
            console.log(`📬 Recipients: ${[finalReviewerEmail, ...ccRecipients].join(', ')}`);
            
            // Additional confirmation  
            if (info.accepted && info.accepted.length > 0) {
                console.log(`✅ Email accepted by server for: ${info.accepted.join(', ')}`);
            }
            if (info.rejected && info.rejected.length > 0) {
                console.log(`❌ Email rejected by server for: ${info.rejected.join(', ')}`);
            }

        } catch (error) {
            console.error(`❌ Error sending reminder email to ${reviewerName}:`, error);
            console.log('⚠️ Email sending failed, but reminder content was generated successfully!');
        }
    }

    /**
     * Main method to run weekly reminder process
     */
    async runWeeklyReminders(): Promise<void> {
        try {
            console.log('🚀 Starting Weekly Reminder Service...');
            
            // Check if it's time to send reminders
            if (!this.shouldSendReminder()) {
                console.log('⏰ It\'s not time for weekly reminders yet. Exiting.');
                return;
            }

            console.log('📅 Time to send weekly reminders!');

            // Test Jira connection
            const connectionTest = await this.jiraService.testConnection();
            if (!connectionTest) {
                throw new Error('Failed to connect to Jira API. Please check your credentials.');
            }

            // Get all issues that need review
            const reviewIssues = await this.getReviewIssues();

            if (reviewIssues.length === 0) {
                console.log('✅ No issues requiring review found. No reminders to send.');
                this.updateReminderState(); // Still update state so we don't check again until next week
                return;
            }

            // Group issues by reviewer
            const reviewerIssuesMap = this.groupIssuesByReviewer(reviewIssues);
            
            console.log(`👥 Found ${reviewerIssuesMap.size} reviewer(s) with pending review items`);

            // Send reminders to each reviewer
            let totalEmailsSent = 0;
            let totalIssuesReminded = 0;
            
            console.log('\n📧 Sending weekly reminder emails...');
            
            for (const [reviewerName, issues] of reviewerIssuesMap.entries()) {
                if (reviewerName !== 'Unassigned') {
                    await this.sendReminderToReviewer(reviewerName, issues);
                    totalEmailsSent++;
                    totalIssuesReminded += issues.length;
                    
                    // Add a small delay between emails to be respectful to the SMTP server
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Update reminder state for next week
            this.updateReminderState();
            
            // Get next scheduled date for logging
            let nextScheduled: string | undefined;
            try {
                const state = JSON.parse(fs.readFileSync(REMINDER_STATE_FILE, 'utf8'));
                nextScheduled = state.nextReminderDate;
            } catch (error) {
                console.warn('⚠️ Could not read next scheduled date for logging');
            }
            
            // Log the activity
            const allRecipients = Array.from(reviewerIssuesMap.entries())
                .filter(([name]) => name !== 'Unassigned')
                .map(([name]) => this.getReviewerEmail(name))
                .filter((email): email is string => email !== null);
            
            this.activityLogger.logWeeklyReminder(
                true, // success
                allRecipients,
                totalIssuesReminded,
                totalEmailsSent,
                nextScheduled
            );
            
            // Final summary
            console.log('\n📊 WEEKLY REMINDER SUMMARY:');
            console.log('='.repeat(60));
            console.log(`✅ Total reminder emails sent: ${totalEmailsSent}`);
            console.log(`🔍 Total issues reminded: ${totalIssuesReminded}`);
            console.log(`👥 Reviewers contacted: ${reviewerIssuesMap.size - (reviewerIssuesMap.has('Unassigned') ? 1 : 0)}`);
            
            if (nextScheduled) {
                console.log(`📅 Next reminder scheduled: ${new Date(nextScheduled).toLocaleString()}`);
            }
            
            console.log('='.repeat(60));
            console.log('✅ Weekly reminder process completed successfully!');
            
            // Display activity summary
            this.activityLogger.displayActivitySummary();

        } catch (error) {
            console.error('❌ Error in weekly reminder service:', error);
            
            // Log the failed activity
            this.activityLogger.logWeeklyReminder(
                false, // failed
                [],
                0,
                0,
                undefined,
                error instanceof Error ? error.message : String(error)
            );
            
            // Display activity summary even on error
            this.activityLogger.displayActivitySummary();
            
            throw error;
        }
    }

    /**
     * Run reminders immediately without checking or updating weekly state
     * This is used for dashboard scheduled reminders that should run at exact times
     */
    public async runScheduledReminders(): Promise<void> {
        console.log('🚀 Running scheduled reminder (bypassing weekly state checks)...');
        
        try {
            // Test Jira connection
            const connectionTest = await this.jiraService.testConnection();
            if (!connectionTest) {
                throw new Error('Failed to connect to Jira API. Please check your credentials.');
            }

            // Get all issues that need review
            const reviewIssues = await this.getReviewIssues();

            if (reviewIssues.length === 0) {
                console.log('✅ No issues requiring review found. No reminders to send.');
                return;
            }

            // Group issues by reviewer
            const reviewerIssuesMap = this.groupIssuesByReviewer(reviewIssues);
            
            console.log(`👥 Found ${reviewerIssuesMap.size} reviewer(s) with pending review items`);

            // Send reminders to each reviewer
            let totalEmailsSent = 0;
            let totalIssuesReminded = 0;
            
            console.log('\n📧 Sending scheduled reminder emails...');
            
            for (const [reviewerName, issues] of reviewerIssuesMap.entries()) {
                if (reviewerName !== 'Unassigned') {
                    await this.sendReminderToReviewer(reviewerName, issues);
                    totalEmailsSent++;
                    totalIssuesReminded += issues.length;
                    
                    // Add a small delay between emails to be respectful to the SMTP server
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            // Log the activity (without state file operations)
            const allRecipients = Array.from(reviewerIssuesMap.entries())
                .filter(([name]) => name !== 'Unassigned')
                .map(([name]) => this.getReviewerEmail(name))
                .filter((email): email is string => email !== null);
            
            this.activityLogger.logWeeklyReminder(
                true, // success
                allRecipients,
                totalIssuesReminded,
                totalEmailsSent,
                undefined // no next scheduled date for dashboard reminders
            );
            
            // Final summary
            console.log('\n📊 SCHEDULED REMINDER SUMMARY:');
            console.log('='.repeat(60));
            console.log(`✅ Total reminder emails sent: ${totalEmailsSent}`);
            console.log(`🔍 Total issues reminded: ${totalIssuesReminded}`);
            console.log(`👥 Reviewers contacted: ${reviewerIssuesMap.size - (reviewerIssuesMap.has('Unassigned') ? 1 : 0)}`);
            console.log('📅 This was a dashboard scheduled reminder (no state file updated)');
            console.log('='.repeat(60));
            console.log('✅ Scheduled reminder process completed successfully!');
            
            // Display activity summary
            this.activityLogger.displayActivitySummary();

        } catch (error) {
            console.error('❌ Error in scheduled reminder service:', error);
            
            // Log the failed activity
            this.activityLogger.logWeeklyReminder(
                false, // failed
                [],
                0,
                0,
                undefined,
                error instanceof Error ? error.message : String(error)
            );
            
            // Display activity summary even on error
            this.activityLogger.displayActivitySummary();
            
            throw error;
        }
    }
}

export default WeeklyReminderService; 