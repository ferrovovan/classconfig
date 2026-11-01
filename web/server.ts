import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const app = express();
const port = 3000;

app.use(express.json({ limit: '10mb' }));

// 1. Статический манифест Model Context Protocol (MCP)
const mcpManifestPath = path.join(ROOT, 'mcp', 'mcp.json');
let mcpManifest = {};
if (fs.existsSync(mcpManifestPath)) {
  try {
    mcpManifest = JSON.parse(fs.readFileSync(mcpManifestPath, 'utf-8'));
  } catch (e) {
    console.error('Failed to read mcp.json:', e);
  }
}

app.get('/mcp.json', (_req, res) => {
  res.sendFile(mcpManifestPath);
});
app.get('/api/mcp/manifest.json', (req, res) => {
  res.json(mcpManifest);
});

app.get('/api/mcp/manifest', (req, res) => {
  res.json(mcpManifest);
});

// 2. Список MCP инструментов
app.get('/api/mcp/tools', (req, res) => {
  res.json({
    tools: (mcpManifest as any).tools || [],
  });
});

// 3. Вызов инструментов MCP (Tool Call Protocol)
app.post('/api/mcp/call', async (req, res) => {
  const { name, arguments: toolArgs } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing tool name' });
  }

  const args = toolArgs || {};

  try {
    switch (name) {
      case 'classconfig_get_limits': {
        return res.json({
          limits: {
            MAX_FILES: 20,
            MAX_FILE_BYTES: 1048576,
            ENCODING: 'utf-8',
            MANIFEST_VERSION: 1,
            CONTEXT_LINES: 3,
            SUPPORTED_EXTENSIONS: 'Any flat UTF-8 files without NUL bytes',
          },
          exit_codes: {
            0: 'Success (No differences or snapshot created)',
            1: 'Success with differences found (Normal audit outcome)',
            2: 'Error occurred (Validation or disk failure)',
          },
        });
      }

      case 'classconfig_generate_guide': {
        const scriptPath = path.join(ROOT, 'scripts', 'generate_guide.py');
        const targetPath = path.join(ROOT, 'docs', 'GUIDE.md');
        const proc = spawn('python3', [scriptPath, targetPath], { cwd: ROOT });
        let out = '';
        proc.stdout.on('data', (d) => (out += d.toString()));
        proc.on('close', (code) => {
          let content = '';
          if (fs.existsSync(targetPath)) {
            content = fs.readFileSync(targetPath, 'utf-8');
          }
          res.json({
            success: code === 0,
            file: 'docs/GUIDE.md',
            output: out,
            content,
          });
        });
        return;
      }

      case 'classconfig_snapshot': {
        const source = args.source || 'demo/config';
        const baseline = args.baseline || 'demo/baseline';
        const proc = spawn('python3', ['-m', 'classconfig', 'snapshot', '--source', source, '--baseline', baseline], {
          cwd: ROOT,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));
        proc.on('close', (code) => {
          res.json({
            tool: name,
            exitCode: code,
            stdout,
            stderr,
          });
        });
        return;
      }

      case 'classconfig_check': {
        const source = args.source || 'demo/config';
        const baseline = args.baseline || 'demo/baseline';
        const report = args.report || 'demo/report.html';
        const proc = spawn(
          'python3',
          ['-m', 'classconfig', 'check', '--source', source, '--baseline', baseline, '--report', report],
          { cwd: ROOT }
        );
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));
        proc.on('close', (code) => {
          let reportHtml = '';
          const absReport = path.isAbsolute(report) ? report : path.join(ROOT, report);
          if (fs.existsSync(absReport)) {
            try {
              reportHtml = fs.readFileSync(absReport, 'utf-8');
            } catch (e) {}
          }
          res.json({
            tool: name,
            exitCode: code,
            stdout,
            stderr,
            reportHtml,
          });
        });
        return;
      }

      case 'classconfig_validate': {
        const source = args.source || 'demo/config';
        const absSource = path.isAbsolute(source) ? source : path.join(ROOT, source);
        if (!fs.existsSync(absSource)) {
          return res.json({
            valid: false,
            error: `SOURCE_NOT_FOUND: папка не найдена: ${source}`,
          });
        }
        const entries = fs.readdirSync(absSource);
        if (entries.length > 20) {
          return res.json({
            valid: false,
            error: `TOO_MANY_FILES: в папке больше 20 объектов: ${entries.length}`,
          });
        }
        return res.json({
          valid: true,
          files_count: entries.length,
          files: entries,
        });
      }

      default:
        return res.status(404).json({ error: `Unknown MCP tool: ${name}` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal error' });
  }
});

// 4. API генерации Шаблона по реализации проекта
app.post('/api/guide/generate', (req, res) => {
  const targetPath = path.join(ROOT, 'docs', 'GUIDE.md');
  const scriptPath = path.join(ROOT, 'scripts', 'generate_guide.py');
  const proc = spawn('python3', [scriptPath, targetPath], { cwd: ROOT });

  proc.on('close', (code) => {
    if (fs.existsSync(targetPath)) {
      const content = fs.readFileSync(targetPath, 'utf-8');
      res.json({
        success: code === 0,
        content,
        filename: 'docs/GUIDE.md',
      });
    } else {
      res.status(500).json({ error: 'Failed to generate guide' });
    }
  });
});

// 5. API запуска тестов Python
app.get('/api/run-tests', async (req, res) => {
  const proc = spawn('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-v'], {
    cwd: ROOT,
  });

  let output = '';
  proc.stdout.on('data', (d) => (output += d.toString()));
  proc.stderr.on('data', (d) => (output += d.toString()));

  proc.on('close', (code) => {
    res.json({
      code,
      passed: code === 0,
      output,
    });
  });
});

// 6. API CLI ClassConfig в изолированной песочнице
app.post('/api/run-cli', async (req, res) => {
  const { command, args, virtualFiles, baselineFiles } = req.body;
  if (!command || !Array.isArray(args)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  let tempBaseDir: string | null = null;
  let sourceDir = path.join(ROOT, 'demo/config');
  let baselineDir = path.join(ROOT, 'demo/baseline');
  let reportFile = path.join(ROOT, 'demo/report.html');

  if (virtualFiles && Array.isArray(virtualFiles)) {
    try {
      tempBaseDir = fs.mkdtempSync(path.join('/tmp', 'classconfig_web_'));
      sourceDir = path.join(tempBaseDir, 'config');
      baselineDir = path.join(tempBaseDir, 'baseline');
      reportFile = path.join(tempBaseDir, 'report.html');
      fs.mkdirSync(sourceDir, { recursive: true });

      for (const vf of virtualFiles) {
        const filePath = path.join(sourceDir, vf.name);
        if (vf.isDirectory) {
          fs.mkdirSync(filePath, { recursive: true });
        } else if (vf.isSymlink) {
          const target = path.join(tempBaseDir, 'target.txt');
          fs.writeFileSync(target, 'target\n');
          fs.symlinkSync(target, filePath);
        } else if (vf.sizeBytes && vf.sizeBytes > 1048576) {
          fs.writeFileSync(filePath, Buffer.alloc(vf.sizeBytes, 'A'));
        } else {
          fs.writeFileSync(filePath, vf.content || '', 'utf-8');
        }
      }

      if (baselineFiles && Array.isArray(baselineFiles) && command === 'check') {
        const baseFilesDir = path.join(baselineDir, 'files');
        fs.mkdirSync(baseFilesDir, { recursive: true });
        const manifestFiles = [];

        for (const bf of baselineFiles) {
          const bFilePath = path.join(baseFilesDir, bf.name);
          const buf = Buffer.from(bf.content || '', 'utf-8');
          fs.writeFileSync(bFilePath, buf);

          const crypto = await import('crypto');
          const sha = crypto.createHash('sha256').update(buf).digest('hex');
          manifestFiles.push({
            name: bf.name,
            size_bytes: buf.length,
            sha256: sha,
          });
        }

        const manifest = {
          version: 1,
          created_at: new Date().toISOString(),
          source_path: sourceDir,
          encoding: 'utf-8',
          limits: { max_files: 20, max_file_bytes: 1048576 },
          files: manifestFiles.sort((a, b) => a.name.localeCompare(b.name)),
        };
        fs.writeFileSync(
          path.join(baselineDir, 'manifest.json'),
          JSON.stringify(manifest, null, 2) + '\n',
          'utf-8'
        );
      }
    } catch (e) {
      console.error('Error setting up isolated temp dir:', e);
    }
  }

  const mappedArgs = args.map((arg, idx) => {
    if (args[idx - 1] === '--source' && tempBaseDir) return sourceDir;
    if (args[idx - 1] === '--baseline' && tempBaseDir) return baselineDir;
    if (args[idx - 1] === '--report' && tempBaseDir) return reportFile;
    return arg;
  });

  const cliArgs = ['-m', 'classconfig', command, ...mappedArgs];
  const proc = spawn('python3', cliArgs, {
    cwd: ROOT,
  });

  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (d) => (stdout += d.toString()));
  proc.stderr.on('data', (d) => (stderr += d.toString()));

  proc.on('close', (code) => {
    let reportHtml = '';
    const targetReport = tempBaseDir
      ? reportFile
      : args.indexOf('--report') !== -1
      ? args[args.indexOf('--report') + 1]
      : null;
    if (targetReport && fs.existsSync(targetReport)) {
      try {
        reportHtml = fs.readFileSync(targetReport, 'utf-8');
      } catch (e) {}
    }

    if (tempBaseDir) {
      try {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      } catch (e) {}
    }

    res.json({
      code,
      stdout,
      stderr,
      reportHtml,
    });
  });
});

// Настройка Vite middleware в dev или статики в prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: __dirname,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`ClassConfig MCP & Web server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
