import { COMMON_ERRORS } from "kizlo"

// Renders the built-in error codes straight from kizlo's COMMON_ERRORS, so the docs never drift from source.
export function CommonErrorsTable() {
	return (
		<table>
			<thead>
				<tr>
					<th>Code</th>
					<th>Status</th>
					<th>Message</th>
				</tr>
			</thead>
			<tbody>
				{Object.entries(COMMON_ERRORS).map(([code, { status, message }]) => (
					<tr key={code}>
						<td>
							<code>{code}</code>
						</td>
						<td>{status}</td>
						<td>{message}</td>
					</tr>
				))}
			</tbody>
		</table>
	)
}
