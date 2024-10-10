import { Editor, Notice } from 'obsidian';
import { formatTask } from 'src/utils/formatter';
import MsTodoSync from '../main';
import { TodoApi } from '../api/todoApi';
import { MsTodoSyncSettings } from '../gui/msTodoSyncSettingTab';
import { t } from './../lib/lang';
import { log } from './../lib/logging';

export function getTaskIdFromLine(line: string, plugin: MsTodoSync): string {
	const regex = /\^(?!.*\^)([A-Za-z0-9]+)/gm;
	const blocklistMatch = regex.exec(line.trim());
	if (blocklistMatch) {
		const blocklink = blocklistMatch[1];
		const taskId = plugin.settings.taskIdLookup[blocklink];
		console.log(taskId);
		return taskId;
	}
	return '';
}

export async function postTask(
	todoApi: TodoApi,
	listId: string | undefined,
	editor: Editor,
	fileName: string | undefined,
	plugin: MsTodoSync,
	replace?: boolean,
) {
	if (!editor.somethingSelected()) {
		new Notice('好像没有选中什么');
		return;
	}
	if (!listId) {
		new Notice('请先设置同步列表');
		return;
	}
	new Notice('创建待办中...', 3000);
	// 创建待办事项的文件名
	const body = `${t('displayOptions_CreatedInFile')} [[${fileName}]]`;
	// 获取选中的文本并格式化
	const formatted = editor
		.getSelection()
		.replace(/(- \[ \] )|\*|^> |^#* |- /gm, '') // 移除特定的字符和格式
		.split('\n') // 按行分割
		.filter((s) => s != ''); // 过滤掉空行
	log('debug', formatted.join(' :: '));
	Promise.all(
		formatted.map(async (s) => {
			const line = s.trim();
			const regex = /\^(?!.*\^)([A-Za-z0-9]+)/gm;
			const blocklistMatch = regex.exec(line);
			if (blocklistMatch) {
				const blocklink = blocklistMatch[1];
				const taskId = plugin.settings.taskIdLookup[blocklink];
				//FIXME If there's a 'Created at xxxx' replaced line,
				// it's not enough to get a cleanTaskTitle after the next line.
				const cleanTaskTitle = line.replace(`^${blocklink}`, '');

				console.log(blocklink);
				console.log(taskId);
				const updatedTask = await todoApi.updateTask(listId, taskId, cleanTaskTitle);
				console.log(updatedTask);
				return { line: cleanTaskTitle, index: blocklink };
			} else {
				const newTask = await todoApi.createTask(listId, line, body);
				plugin.settings.taskIdIndex = plugin.settings.taskIdIndex + 1;
				const index = `${Math.random().toString(20).substring(2, 6)}${plugin.settings.taskIdIndex
					.toString()
					.padStart(5, '0')}`;
				plugin.settings.taskIdLookup[index] = newTask.id === undefined ? '' : newTask.id;
				await plugin.saveSettings();
				return { line, index };
			}
		}),
	).then((res) => {
		new Notice('创建待办成功√');
		if (replace) {
			editor.replaceSelection(
				res
					.map((i) => {
						let createdAt = '';
						const blocklink = `^${i.index}`;
						const formattedTask = formatTask(plugin, i.line);
						if (plugin.settings.displayOptions_ReplaceAddCreatedAt) {
							createdAt = `${t('displayOptions_CreatedAtTime')} ${window
								.moment()
								.format(plugin.settings.displayOptions_TimeFormat)}`;
						}
						return `${formattedTask} ${createdAt} ${blocklink}`;
					})
					.join('\n'),
			);
		}
	});
}

export async function createTodayTasks(todoApi: TodoApi, settings: MsTodoSyncSettings, editor?: Editor) {
	new Notice('获取微软待办中', 3000);
	const now = window.moment();
	const pattern = `status ne 'completed' or completedDateTime/dateTime ge '${now.format('yyyy-MM-DD')}'`;
	const taskLists = await todoApi.getLists(pattern);
	if (!taskLists || taskLists.length == 0) {
		new Notice('任务列表为空');
		return;
	}
	const segments = taskLists
		.map((taskList) => {
			if (!taskList.tasks || taskList.tasks.length == 0) return;
			taskList.tasks.sort((a, b) => (a.status == 'completed' ? 1 : -1));
			const lines = taskList.tasks?.map((task) => {
				const formattedCreateDate = window
					.moment(task.createdDateTime)
					.format(settings.displayOptions_DateFormat);
				const done = task.status == 'completed' ? 'x' : ' ';
				const createDate =
					formattedCreateDate == now.format(settings.displayOptions_DateFormat)
						? ''
						: `${settings.displayOptions_TaskCreatedPrefix}[[${formattedCreateDate}]]`;
				const body = !task.body?.content ? '' : `${settings.displayOptions_TaskBodyPrefix}${task.body.content}`;

				return `- [${done}] ${task.title}  ${createDate}  ${body}`;
			});
			return `**${taskList.displayName}**
${lines?.join('\n')}
`;
		})
		.filter((s) => s != undefined)
		.join('\n\n');

	new Notice('待办列表已获取');
	if (editor) editor.replaceSelection(segments);
	else return segments;
}

// 在 msTodoCommand.ts 中添加这个新函数
export async function postSingleTask(
	todoApi: TodoApi,
	listId: string | undefined,
	editor: Editor,
	fileName: string | undefined,
	plugin: MsTodoSync,
	replace?: boolean,
) {
	if (!editor.somethingSelected()) {
		new Notice('好像没有选中什么');
		return;
	}
	if (!listId) {
		new Notice('请先设置同步列表');
		return;
	}
	new Notice('创建单个待办中...', 3000);

	const body = `${t('displayOptions_CreatedInFile')} [[${fileName}]]`;
	const selectedText = editor.getSelection().trim();

	const newTask = await todoApi.createTask(listId, selectedText, body);
	plugin.settings.taskIdIndex = plugin.settings.taskIdIndex + 1;
	const index = `${Math.random().toString(20).substring(2, 6)}${plugin.settings.taskIdIndex
		.toString()
		.padStart(5, '0')}`;
	plugin.settings.taskIdLookup[index] = newTask.id === undefined ? '' : newTask.id;
	await plugin.saveSettings();

	new Notice('创建单个待办成功√');
	if (replace) {
		let createdAt = '';
		const blocklink = `^${index}`;
		const formattedTask = formatTask(plugin, selectedText);
		if (plugin.settings.displayOptions_ReplaceAddCreatedAt) {
			createdAt = `${t('displayOptions_CreatedAtTime')} ${window
				.moment()
				.format(plugin.settings.displayOptions_TimeFormat)}`;
		}
		editor.replaceSelection(`${formattedTask} ${createdAt} ${blocklink}`);
	}
}
