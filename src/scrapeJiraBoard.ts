import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JiraService, { JiraIssue } from './jiraService.js';
import EmailActivityLogger from './emailActivityLogger.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force load environment variables from .env file, overriding system variables
console.log('🔧 Loading environment variables from .env file...');

// For ES modules, we need to be more explicit about the path
const envPath = path.resolve(process.cwd(), '.env');
console.log(`📁 Looking for .env file at: ${envPath}`);

if (fs.existsSync(envPath)) {
    console.log('✅ .env file found, loading...');
    dotenv.config({ path: envPath, override: true });
} else {
    console.log('⚠️ .env file not found at expected location, trying default...');
    dotenv.config({ override: true });
}

// Debug: Show what was loaded
console.log('🔍 Environment variables loaded:');
console.log(`  SMTP_SERVER: ${process.env.SMTP_SERVER || 'NOT SET'}`);
console.log(`  JIRA_USERNAME: ${process.env.JIRA_USERNAME || 'NOT SET'}`);
console.log(`  JIRA_PASSWORD: ${process.env.JIRA_PASSWORD ? 'SET' : 'NOT SET'}`);
console.log(`  SENDER_EMAIL: ${process.env.SENDER_EMAIL || 'NOT SET'}`);
console.log(`  Doc_Email1: ${process.env.Doc_Email1 || 'NOT SET'}`);

// Map old variable names to new ones for the Jira service
process.env.JIRA_EMAIL = process.env.JIRA_USERNAME;
process.env.JIRA_API_TOKEN = process.env.JIRA_PASSWORD;

// Check if required environment variables are set
const requiredEnvVars = [
    'SMTP_SERVER', 'SMTP_PORT', 'SENDER_EMAIL', 'SENDER_NAME', 
    'smtp_username', 'EMAIL_PASSWORD', 
    'JIRA_USERNAME', 'JIRA_PASSWORD', 'JIRA_RAPID_VIEW'
];

// Optional email variables
const optionalEmailVars = ['Doc_Email1', 'Doc_Email2', 'Doc_Email3'];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

console.log(`✅ Using SMTP_SERVER: ${process.env.SMTP_SERVER}`);
console.log(`✅ Using SENDER_EMAIL: ${process.env.SENDER_EMAIL}`);
console.log(`✅ Using smtp_username: ${process.env.smtp_username}`);

// Use the JiraIssue interface from the service
type Issue = JiraIssue;

interface FormattedIssues {
    summary: string;
    table: string;
}

function formatIssuesTable(issues: Issue[]): FormattedIssues {
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
    const summary = summaryLines.join('\n');

    // Create table header
    const tableHeader = 'Issue\tTitle\tAssignee\tStatus';

    // Create table rows
    const tableRows = issues.map(issue => 
        `${issue.key}\t${issue.summary}\t${issue.assignee}\t${issue.status}`
    ).join('\n');

    return {
        summary,
        table: `${tableHeader}\n${tableRows}`
    };
}

async function sendEmail(issues: Issue[]): Promise<void> {
    let recipients: string[] = [];
    let summary = '';
    let table = '';
    
    try {
        console.log('📧 Configuring email settings...');
        
        // Debug: Show SMTP configuration
        console.log('🔧 SMTP Configuration:');
        console.log(`  Host: ${process.env.SMTP_SERVER}`);
        console.log(`  Port: ${process.env.SMTP_PORT}`);
        console.log(`  Username: ${process.env.smtp_username}`);
        console.log(`  Sender: ${process.env.SENDER_EMAIL}`);
        console.log(`  SSL: ${process.env.USE_SSL}`);
        
        // Create transporter using custom SMTP settings from .env
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_SERVER,
            port: Number(process.env.SMTP_PORT),
            secure: process.env.USE_SSL === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.smtp_username,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: {
                // Do not fail on invalid certs for corporate networks
                rejectUnauthorized: false
            },
            connectionTimeout: 60000, // 60 seconds
            greetingTimeout: 30000, // 30 seconds
            socketTimeout: 60000 // 60 seconds
        });

        // Skip SMTP verification for faster testing
        console.log('🔄 Skipping SMTP verification for faster execution...');

        const { summary: formattedSummary, table: formattedTable } = formatIssuesTable(issues);
        summary = formattedSummary;
        table = formattedTable;

        // Debug: Show loaded email variables
        console.log('🔍 Checking email environment variables:');
        console.log(`  Doc_Email1: ${process.env.Doc_Email1 || 'not set'}`);
        console.log(`  Doc_Email2: ${process.env.Doc_Email2 || 'not set'}`);
        console.log(`  Doc_Email3: ${process.env.Doc_Email3 || 'not set'}`);
        console.log(`  EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? 'set' : 'not set'}`);
        console.log(`  SMTP_SERVER: ${process.env.SMTP_SERVER || 'not set'}`);

        // Prepare recipient list
        recipients = [
            process.env.Doc_Email1,
            process.env.Doc_Email2,
            process.env.Doc_Email3
        ].filter((email): email is string => email !== undefined && email.trim() !== '');

        if (recipients.length === 0) {
            throw new Error('No valid email recipients found in environment variables');
        }

        // Prepare CC recipient
        const ccRecipient = process.env.CC_EMAIL?.trim();

        console.log(`📬 Sending email to ${recipients.length} recipient(s):`);
        recipients.forEach(email => console.log(`  - ${email}`));
        
        if (ccRecipient) {
            console.log(`📄 CC: ${ccRecipient}`);
        }

        // Email options with updated HTML template
        const mailOptions = {
            from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
            to: recipients.join(','),
            cc: ccRecipient,
            subject: `Sprint Update`,
            text: `Sprint Update\n\nSummary\n${summary}\n\nBelow is the current status of all issues in the active sprint:\nActive Sprint Issues\n${table}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Sprint Update</title>
                </head>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
                    
                    <!-- Header -->
                    <div style="background: #0052cc; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: left;">
                        <h1 style="margin: 0; font-size: 28px; font-weight: 600;">Sprint Update</h1>
                    </div>
                    
                    <!-- Main Content Container -->
                    <div style="background: white; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                        
                        <!-- Summary Section -->
                        <div style="padding: 30px; border-bottom: 1px solid #e1e5e9;">
                            <h2 style="color: #172b4d; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">Summary</h2>
                            <div style="background-color: #f4f5f7; padding: 20px; border-radius: 6px; border-left: 4px solid #0052cc;">
                                <pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; white-space: pre-wrap; color: #42526e; font-size: 14px; line-height: 1.5;">${summary}</pre>
                            </div>
                        </div>
                        
                        <!-- Issues Section -->
                        <div style="padding: 30px;">
                            <p style="margin: 0 0 20px 0; color: #42526e; font-size: 14px;">Below is the current status of all issues in the active sprint:</p>
                            
                            <h2 style="color: #0052cc; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">Active Sprint Issues</h2>
                            
                            <!-- Issues Table -->
                            <div style="overflow-x: auto; border: 1px solid #dfe1e6; border-radius: 6px;">
                                <table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px;">
                                    <thead>
                                        <tr style="background-color: #f4f5f7;">
                                            <th style="border: 1px solid #dfe1e6; padding: 12px 16px; text-align: left; font-weight: 600; color: #172b4d;">Issue</th>
                                            <th style="border: 1px solid #dfe1e6; padding: 12px 16px; text-align: left; font-weight: 600; color: #172b4d;">Title</th>
                                            <th style="border: 1px solid #dfe1e6; padding: 12px 16px; text-align: left; font-weight: 600; color: #172b4d;">Assignee</th>
                                            <th style="border: 1px solid #dfe1e6; padding: 12px 16px; text-align: left; font-weight: 600; color: #172b4d;">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${issues.map((issue: Issue, index: number) => `
                                            <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f9fafc'}; border-bottom: 1px solid #dfe1e6;">
                                                <td style="border: 1px solid #dfe1e6; padding: 12px 16px;">
                                                    <a href="https://jira.corp.adobe.com/browse/${issue.key}" style="color: #0052cc; text-decoration: none; font-weight: 500; font-size: 14px;">${issue.key}</a>
                                                </td>
                                                <td style="border: 1px solid #dfe1e6; padding: 12px 16px; color: #172b4d; font-size: 14px; line-height: 1.4;">${issue.summary}</td>
                                                <td style="border: 1px solid #dfe1e6; padding: 12px 16px; color: #42526e; font-size: 14px;">${issue.assignee}</td>
                                                <td style="border: 1px solid #dfe1e6; padding: 12px 16px; color: #42526e; font-size: 14px;">
                                                    ${issue.status}
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        // Send email with retry logic
        console.log('📤 Sending email...');
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully!');
        console.log(`📧 Message ID: ${info.messageId}`);
        console.log(`📬 Recipients: ${recipients.join(', ')}`);
        
        // Additional confirmation
        if (info.accepted && info.accepted.length > 0) {
            console.log(`✅ Email accepted by server for: ${info.accepted.join(', ')}`);
        }
        if (info.rejected && info.rejected.length > 0) {
            console.log(`❌ Email rejected by server for: ${info.rejected.join(', ')}`);
        }
        
        // Log the activity
        const activityLogger = new EmailActivityLogger();
        activityLogger.logSprintUpdate(true, recipients, issues.length);
        
        // Display activity summary
        activityLogger.displayActivitySummary();
        
    } catch (error) {
        console.error('❌ Error sending email:', error);
        console.log('\n📧 EMAIL CONTENT THAT WOULD HAVE BEEN SENT:');
        console.log('='.repeat(60));
        console.log(`To: ${recipients.join(', ')}`);
        console.log(`Subject: Sprint Update`);
        console.log('\nSUMMARY:');
        console.log(summary);
        console.log('\nISSUES TABLE:');
        console.log(table);
        console.log('='.repeat(60));
        console.log('⚠️ Email sending failed, but issue extraction was successful!');
        
        // Log the failed activity
        const activityLogger = new EmailActivityLogger();
        activityLogger.logSprintUpdate(false, recipients, issues.length, error instanceof Error ? error.message : String(error));
        
        // Display activity summary
        activityLogger.displayActivitySummary();
        // Don't throw error, just continue
    }
}

async function fetchJiraIssuesFromBoard(rapidViewId: string): Promise<Issue[]> {
    console.log('🚀 Fetching issues from Jira board using REST API...');
    
    try {
        const jiraService = new JiraService();
        
        // Test connection first
        const connectionTest = await jiraService.testConnection();
        if (!connectionTest) {
            throw new Error('Failed to connect to Jira API. Please check your credentials.');
        }
        
        // Get board info
        await jiraService.getBoardInfo(rapidViewId);
        
        // Try to get active sprint issues first
        let issues = await jiraService.getActiveSprintIssues(rapidViewId);
        
        // If no active sprint issues, get all board issues
        if (issues.length === 0) {
            console.log('📋 No active sprint found, fetching all board issues...');
            issues = await jiraService.getBoardIssues(rapidViewId);
        }
        
        if (issues.length === 0) {
            throw new Error('No issues found on the board');
        }
        
        console.log(`✅ Successfully fetched ${issues.length} issues from Jira API!`);
        
        // Filter out closed issues (exclude Close, Closed, Done, Resolved statuses)
        const closedStatuses = ['close', 'closed', 'done', 'resolved'];
        const openIssues = issues.filter(issue => 
            !closedStatuses.includes(issue.status.toLowerCase())
        );
        
        const filteredCount = issues.length - openIssues.length;
        if (filteredCount > 0) {
            console.log(`🔍 Filtered out ${filteredCount} closed issues from sprint update email`);
        }
        
        // Display extracted issues (only open issues)
        console.log('\n📋 FETCHED ISSUES (EXCLUDING CLOSED):');
        console.log('='.repeat(80));
        openIssues.forEach((issue, index) => {
            console.log(`${(index + 1).toString().padStart(2)}. ${issue.key}`);
            console.log(`    Summary: ${issue.summary}`);
            console.log(`    Assignee: ${issue.assignee}`);
            console.log(`    Status: ${issue.status}`);
            console.log(`    Type: ${issue.issueType}`);
            console.log(`    Priority: ${issue.priority}`);
            console.log('');
        });
        console.log('='.repeat(80));
        
        return openIssues;
        
    } catch (error) {
        console.error('❌ Failed to fetch issues from Jira API:', error);
        throw error;
    }
}

async function getJiraIssues(): Promise<void> {
    try {
        console.log('🚀 Starting Jira issue extraction...');
        
        const rapidViewId = process.env.JIRA_RAPID_VIEW || '44313';
        console.log(`📋 Using Rapid View ID: ${rapidViewId}`);
        
        // Get issues from Jira board using API
        const issues = await fetchJiraIssuesFromBoard(rapidViewId);
        
        if (issues.length === 0) {
            console.log('❌ No issues extracted from scrum board');
            return;
        }
        
        console.log(`✅ Found ${issues.length} issues from scrum board`);
        
        // Send email with real issues
        await sendEmail(issues);
        
    } catch (error) {
        console.error('❌ Error in getJiraIssues:', error);
        throw error;
    }
}

// Main execution
console.log('🎯 Starting Jira scraper...');
getJiraIssues().catch(console.error); 