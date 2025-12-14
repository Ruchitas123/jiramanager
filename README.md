# JIRA Email Reminder Manager

A comprehensive web-based application for managing JIRA sprint status updates and automated email reminders. Features both a modern web interface and command-line tools for flexible workflow management.

## ✨ Features

### 🌐 Web Interface
- **Modern Dashboard**: Beautiful, responsive web interface accessible via browser
- **JIRA Board Management**: Add, validate, and manage multiple JIRA boards
- **Smart Validation**: Real-time board validation with issue count verification
- **Email Actions**: Send immediate status and reminder emails
- **Schedule Management**: Create, enable/disable, and delete scheduled tasks
- **Progressive UI**: Interface adapts based on available boards and configurations
- **Confirmation Dialogs**: Professional modal confirmations for all destructive actions
- **Activity Logging**: Real-time activity tracking with comprehensive logs

### 📧 Email Automation
- **Status Mail**: Immediate sprint status updates for specific boards
- **Reminder Mail**: Automated reminders to reviewers with pending issues
- **Flexible Scheduling**: Daily, weekly, or monthly automated emails
- **HTML Formatting**: Professional email templates with tables and styling
- **Issue Summary**: Count of issues by status with detailed tables
- **Clickable Links**: Direct links to JIRA issues

### 🔧 Advanced Features
- **Multiple Board Support**: Manage unlimited JIRA boards simultaneously
- **Scheduled Task Management**: Individual toggles for enabling/disabling schedules
- **Duplicate Prevention**: Smart validation prevents duplicate board additions
- **Orphaned Task Cleanup**: Automatic cleanup of orphaned scheduled tasks
- **Real Issue Extraction**: Uses JIRA REST API for accurate data
- **Security**: All credentials secured in environment variables

## 📁 Project Structure

```
email-reminder/
├── src/
│   ├── webServer.ts               # Main web server and API endpoints
│   ├── jiraService.ts             # JIRA REST API service layer
│   ├── weeklyReminderService.ts   # Weekly reminder functionality
│   ├── scrapeJiraBoard.ts         # Sprint update application (CLI)
│   ├── runWeeklyReminders.ts      # Standalone weekly reminder runner
│   ├── emailActivityLogger.ts     # Email activity tracking service
│   ├── viewEmailActivity.ts       # Email activity viewer
│   ├── ldap.ts                    # LDAP integration (optional)
│   └── testLdap.ts               # LDAP connection testing
├── public/                        # Web interface files
│   ├── index.html                 # Main dashboard HTML
│   ├── style.css                  # Modern styling with glassmorphism
│   └── script.js                  # Frontend JavaScript logic
├── build/                         # Compiled JavaScript files
├── app-config.json               # Application configuration (auto-created)
├── weekly-reminder-state.json    # Weekly reminder state (auto-created)
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── .env                          # Environment variables (create from template)
├── .gitignore                    # Git ignore rules
├── LICENSE                       # MIT License
└── README.md                     # This documentation
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file with your credentials (see Environment Configuration below)

### 3. Start the Web Interface
```bash
npm run web-dev
```

### 4. Access Dashboard
Open your browser to: **http://localhost:3000**

## 💻 Usage

### 🌐 Web Interface (Recommended)

The web interface provides a complete dashboard for managing all JIRA email automation tasks.

#### **Getting Started**
1. **Start the server**: `npm run web-dev`
2. **Open browser**: Navigate to http://localhost:3000
3. **Test connection**: Click the settings icon (⚙️) in top right → "Test JIRA Connection"
4. **Add JIRA board**: Click "Add New JIRA Board" → Enter details → Validate → Save

#### **Managing JIRA Boards**
- **Add Board**: Use the "Add New JIRA Board" button
- **Validate**: Always validate boards before saving (shows board info and issue count)
- **Select Board**: Choose a board from the dropdown for email actions
- **Remove Board**: Click "Remove" (will also delete all related scheduled tasks)

#### **Email Actions**
- **Status Mail**: Send immediate sprint status update for selected board
- **Reminder Mail**: Send immediate reminder to reviewers with pending issues
- **Schedule**: Create automated recurring emails (daily/weekly/monthly)

#### **Scheduled Tasks**
- **View Tasks**: See all scheduled tasks in the "Scheduled Tasks" section
- **Toggle Tasks**: Enable/disable individual schedules using toggle switches
- **Delete Tasks**: Remove specific scheduled tasks using trash icon
- **Automatic Cleanup**: Tasks are automatically removed when associated boards are deleted

#### **Key Behaviors**
- ✅ **Board-Task Relationship**: All scheduled tasks are tied to specific JIRA boards
- ✅ **Automatic Cleanup**: Deleting a board removes all its scheduled tasks
- ✅ **Fresh Start**: Re-adding a previously deleted board starts with no schedules
- ✅ **Duplicate Prevention**: Cannot add the same board ID twice
- ✅ **Progressive UI**: Interface shows relevant sections based on your configuration

### ⌨️ Command Line Interface

For automation and scripting, use the CLI commands:

```bash
# Immediate Actions
npm run sprint-update-dev     # Send sprint status update
npm run weekly-reminder-dev   # Send weekly reminder
npm run view-activity-dev     # View email activity logs
npm run test-ldap-dev        # Test LDAP connection

# Production Mode (with build step)
npm run sprint-update        # Send sprint status update  
npm run weekly-reminder      # Send weekly reminder
npm run view-activity        # View email activity logs
npm run test-ldap           # Test LDAP connection
```

## ⚙️ Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory with the following variables:

```env
# SMTP Configuration
SMTP_SERVER=authrelay.corp.adobe.com
SMTP_PORT=587
USE_SSL=false
smtp_username=your-smtp-username@example.com
EMAIL_PASSWORD=your-email-password
SENDER_EMAIL=your-sender-email@example.com
SENDER_NAME=Your Name

# Jira Configuration
JIRA_USERNAME=your-jira-username@example.com
JIRA_PASSWORD=your-jira-password
JIRA_RAPID_VIEW=Radid ID

# Email Recipients
Doc_Email1=recipient1@example.com
Doc_Email2=recipient2@example.com
Doc_Email3=recipient3@example.com
CC_EMAIL=additional-cc@example.com
```

**Important**: Ensure your `.env` file is encoded in UTF-8 format, not UTF-16.

### 3. Build the Project
```bash
npm run build
```

### 4. Run the Application

#### Sprint Update Email 
```bash
npm run sprint-update
# or simply
npm start
```

#### Weekly Reminder Emails
```bash
npm run weekly-reminder
```

#### View Email Activity Status
```bash
npm run view-activity
```

For development/testing:
```bash
npm run sprint-update-dev    # Sprint updates
npm run weekly-reminder-dev  # Weekly reminders
npm run view-activity-dev    # View activity status
```

## How It Works

### Email System Overview

This project now includes **two independent email systems**:

1. **Sprint Update Mail**: Sends comprehensive sprint status updates (existing functionality)
2. **Gentle Reminder Mail**: Sends targeted reminders to reviewers with pending review items (new functionality)

Both systems operate independently and do not interfere with each other.

### Activity Tracking System

**Security Notice**: Email activity logging to files has been **disabled** for security to protect sensitive data.

- **Console-Only Logging**: Email operations are logged to console during execution only
- **No File Storage**: Email addresses and sensitive data are not stored in files
- **Privacy Protection**: Prevents accidental exposure of email recipient information
- **Real-time Monitoring**: All activity visible in console output during operation

#### Viewing Activity Status

Use the activity viewer to see current email status:
```bash
npm run view-activity-dev
```

This displays:
- Last sent dates for both systems
- Next scheduled weekly reminder date
- Total emails sent counts
- Current status and any recent errors
- Recipients and issue counts from last run

### Weekly Reminder System

The Weekly Reminder System automatically identifies users with issues in "to review" status and sends them personalized reminder emails once every 7 days.

#### Key Features:
- **Smart Scheduling**: Automatically tracks when reminders were last sent and waits exactly 7 days before sending the next batch
- **Status Filtering**: Only targets issues with status containing "review" or "to review" (case-insensitive)
- **Reviewer Grouping**: Groups issues by assignee and sends personalized emails to each reviewer
- **State Persistence**: Uses `weekly-reminder-state.json` to track reminder schedule
- **Non-Intrusive**: Completely separate from Sprint Update emails
- **Professional HTML Format**: Distinctive orange-themed emails with "Weekly Reminder Mail" subject

#### How Weekly Reminders Work:
1. **Status Check**: System checks if 7 days have passed since last reminder
2. **Issue Filtering**: Fetches all board issues and filters for "review" status
3. **Reviewer Identification**: Groups issues by assignee (reviewer)
4. **Email Generation**: Creates personalized reminder emails for each reviewer
5. **State Update**: Records current time and schedules next reminder for 7 days later

#### Weekly Reminder Schedule:
- **First Run**: Sends reminders immediately if no previous state exists
- **Subsequent Runs**: Only sends reminders if 7+ days have passed since last reminder
- **State File**: Creates `weekly-reminder-state.json` to track schedule automatically

### Authentication Flow
1. **Automated Okta**: The system automatically handles Adobe Okta SSO authentication
2. **Email Verification**: If email matches JIRA_USERNAME, it attempts to click "Yes, it's me" automatically
3. **Manual Fallback**: If automation fails, it falls back to manual authentication with monitoring

### Issue Extraction Process
1. **Board Access**: Opens the specified Jira scrum board (RapidView 44313)
2. **Real Data Extraction**: Extracts actual issues from the board using comprehensive selectors
3. **Status Detection**: Determines real status based on which column each issue is in:
   - Qualification Required
   - Qualified
   - To Document
   - Documentation in Progress
   - To Review
   - Documented
   - Close
4. **Assignee Detection**: Extracts real assignee names using multiple detection methods
5. **Data Validation**: Validates and cleans extracted data

### Email Features
- **HTML Formatting**: Professional email template with tables and styling
- **Issue Summary**: Count of issues by status
- **Detailed Table**: Complete list with Issue ID, Title, Assignee, and Status
- **Clickable Links**: Direct links to Jira issues
- **No Dates**: Clean format without timestamps per user requirements

## Current Results

The system successfully extracts **CQDOC issues**.

## Security Features

- **Environment Variables**: All sensitive data stored in .env file
- **No Hardcoded Credentials**: No sensitive information in source code
- **Automatic Cleanup**: Screenshots and temporary files automatically deleted
- **SSL/TLS Support**: Secure email transmission

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading**
   - Ensure .env file is in UTF-8 encoding
   - Check file path and permissions
   - Verify all required variables are set

2. **Authentication Issues**
   - Verify JIRA_USERNAME and JIRA_PASSWORD
   - Check Okta authentication flow
   - Ensure network connectivity to Adobe systems

3. **Email Delivery Issues**
   - Verify SMTP settings
   - Check email credentials
   - Ensure corporate network access

4. **Issue Extraction Problems**
   - Verify board access permissions
   - Check RapidView ID (44313)
   - Ensure board contains issues

5. **Weekly Reminder Issues**
   - Check if `weekly-reminder-state.json` exists and is readable
   - Verify issues with "review" status exist on the board
   - Ensure 7 days have passed since last reminder
   - Check email recipients are configured (Doc_Email1, Doc_Email2, Doc_Email3)
   - Review console logs for filtering and grouping information

## 🛠️ Development

### Available Commands

#### Web Interface
```bash
npm run web-dev              # Start web server (development mode)
npm run web                  # Start web server (production mode)
```

#### Command Line Tools
```bash
npm run sprint-update-dev    # Send sprint status update
npm run weekly-reminder-dev  # Send weekly reminder  
npm run view-activity-dev    # View email activity logs
npm run test-ldap-dev       # Test LDAP connection

# Production mode (with build step)
npm run sprint-update       # Send sprint status update
npm run weekly-reminder     # Send weekly reminder
npm run view-activity       # View email activity logs  
npm run test-ldap          # Test LDAP connection
```

#### Build & Utility
```bash
npm run build               # Compile TypeScript to JavaScript
npm run clean              # Remove build directory
npm start                  # Alias for sprint-update
npm run dev                # Alias for sprint-update-dev
```

### Development Workflow

1. **Start with Web Interface**: Most tasks can be done via http://localhost:3000
2. **Use CLI for Automation**: Command line tools are ideal for scripts and cron jobs
3. **Development Mode**: Uses `ts-node` for faster iteration (no build step)
4. **Production Mode**: Compiles TypeScript first for optimized performance

### Dependencies
- **puppeteer**: Web scraping and automation
- **nodemailer**: Email sending
- **jira-client**: Jira API client (backup)
- **axios**: HTTP requests
- **dotenv**: Environment variable management

## License

MIT License - see LICENSE file for details.

## Support

For issues or questions, please check the troubleshooting section above or contact the development team.
