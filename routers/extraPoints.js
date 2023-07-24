import mysql from "mysql2";
import { Router } from "express";
import proxyExtraPoints from "../middleware/proxyExtraPoints.js";

const extrapointsHub = Router();
let connection;

/* Connection to the database */
extrapointsHub.use((req, res, next) => {
  const config = JSON.parse(process.env.MY_CONNECT)
  connection = mysql.createPool(config);
  next();
})

/* GET students' information with total extra points, ordered by student_id */
extrapointsHub.get("/", (req, res) => {
  connection.query(
    `SELECT s.student_id, u.user_name AS student_name, IFNULL(SUM(ep_type.ext_type_value), 0) AS total_extra_points
    FROM students s
    JOIN users u ON s.student_user_id = u.user_id
    LEFT JOIN extra_points ep ON s.student_id = ep.ext_student_id
    LEFT JOIN extra_points_type ep_type ON ep.ext_type_id = ep_type.ext_type_id
    GROUP BY s.student_id, u.user_name
    ORDER BY s.student_id ASC`,
    (err, result, fields) => {
      if (err) {
        console.error(err);
        return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
      } else {
        res.json(result);
      }
    }
  );
});

/* GET student's information with total extra points and last comment */
extrapointsHub.get("/:studentId", (req, res) => {
  const studentId = req.params.studentId;

  connection.query(
    `SELECT s.student_id, u.user_name AS student_name, u.user_id AS user_id,
    t.teacher_id, t.teacher_user_id, ut.user_name AS teacher_name,
    IFNULL(SUM(ep_type.ext_type_value), 0) AS total_extra_points,
    MAX(ep.ext_comments) AS last_comment
    FROM students s
    JOIN users u ON s.student_user_id = u.user_id
    LEFT JOIN extra_points ep ON s.student_id = ep.ext_student_id
    LEFT JOIN teachers t ON ep.ext_teacher_id = t.teacher_id
    LEFT JOIN users ut ON t.teacher_user_id = ut.user_id
    LEFT JOIN extra_points_type ep_type ON ep.ext_type_id = ep_type.ext_type_id
    WHERE s.student_id = ?
    GROUP BY s.student_id, u.user_name, u.user_id, t.teacher_id, t.teacher_user_id, ut.user_name`,
    [studentId],
    (err, result, fields) => {
      if (err) {
        console.error(err);
        return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
      } else if (result.length === 0) {
        return res.status(404).send("Student not found");
      } else {
        const studentInfo = result[0];
        res.json(studentInfo);
      }
    }
  );
});

/* POST student's extra points to the database */
extrapointsHub.post("/:studentId/extra-points", proxyExtraPoints, (req, res) => {
  const studentId = req.params.studentId;
  const { teacherId, typeId, comments } = req.body;

  // First, check if the student exists in the database
  connection.query(
    'SELECT * FROM students WHERE student_id = ?',
    [studentId],
    (err, studentResult, fields) => {
      if (err) {
        console.error(err);
        return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
      }

      if (studentResult.length === 0) {
        return res.status(404).send("Student not found");
      }

      // Student exists, now get the user_id and class_id of the student
      const userId = studentResult[0].student_user_id;

      // Get the class_id of the student
      connection.query(
        'SELECT class_id FROM user_class WHERE user_id = ?',
        [userId],
        (err, classResult, fields) => {
          if (err) {
            console.error(err);
            return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
          }

          if (classResult.length === 0) {
            return res.status(404).send("Student's class not found");
          }

          const classId = classResult[0].class_id;

          // Check if the teacher exists in the database
          connection.query(
            'SELECT * FROM teachers WHERE teacher_id = ?',
            [teacherId],
            (err, teacherResult, fields) => {
              if (err) {
                console.error(err);
                return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
              }

              if (teacherResult.length === 0) {
                return res.status(404).send("Teacher not found");
              }

              // Teacher exists, now insert the extra points into the "extra_points" table
              connection.query(
                'INSERT INTO extra_points (ext_teacher_id, ext_student_id, ext_class_id, ext_type_id, ext_comments) VALUES (?, ?, ?, ?, ?)',
                [teacherId, userId, classId, typeId, comments],
                (err, result, fields) => {
                  if (err) {
                    console.error(err);
                    return res.status(500).send("¡ERROR! Error Inserting Data Into the DataBase");
                  } else {
                    // Get the updated total_extra_points for the student
                    connection.query(
                      `SELECT IFNULL(SUM(ep_type.ext_type_value), 0) AS total_extra_points
                      FROM extra_points ep
                      JOIN extra_points_type ep_type ON ep.ext_type_id = ep_type.ext_type_id
                      WHERE ep.ext_student_id = ?`,
                      [studentId],
                      (err, totalPointsResult, fields) => {
                        if (err) {
                          console.error(err);
                          return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
                        } else {
                          const totalExtraPoints = totalPointsResult[0].total_extra_points;
                          res.json({ message: "Extra points added successfully :) (ExtraPoints)", total_extra_points: totalExtraPoints });
                        }
                      }
                    );
                  }
                }
              );
            }
          );
        }
      );
    }
  );
});

/* UPDATE the information of the extrapoints in the database */
extrapointsHub.put("/:studentId/extra-points", proxyExtraPoints, (req, res) => {
  const studentId = req.params.studentId;
  const { teacherId, typeId, comments, points } = req.body;

  // First, check if the student exists in the database
  connection.query(
    'SELECT * FROM students WHERE student_id = ?',
    [studentId],
    (err, studentResult, fields) => {
      if (err) {
        console.error(err);
        return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
      }

      if (studentResult.length === 0) {
        return res.status(404).send("Student not found");
      }

      // Student exists, now get the user_id and class_id of the student
      const userId = studentResult[0].student_user_id;

      // Get the class_id of the student
      connection.query(
        'SELECT class_id FROM user_class WHERE user_id = ?',
        [userId],
        (err, classResult, fields) => {
          if (err) {
            console.error(err);
            return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
          }

          if (classResult.length === 0) {
            return res.status(404).send("Student's class not found");
          }

          const classId = classResult[0].class_id;

          // Check if the teacher exists in the database
          connection.query(
            'SELECT * FROM teachers WHERE teacher_id = ?',
            [teacherId],
            (err, teacherResult, fields) => {
              if (err) {
                console.error(err);
                return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
              }

              if (teacherResult.length === 0) {
                return res.status(404).send("Teacher not found");
              }

              // Update the extra points in the "extra_points" table
              connection.query(
                'UPDATE extra_points SET ext_teacher_id = ?, ext_class_id = ?, ext_type_id = ?, ext_comments = ?, ext_type_value = ? WHERE ext_student_id = ?',
                [teacherId, classId, typeId, comments, points, studentId],
                (err, updateResult, fields) => {
                  if (err) {
                    console.error(err);
                    return res.status(500).send("¡ERROR! Error Updating Data in the DataBase");
                  } else {
                    // Get the updated total_extra_points for the student
                    connection.query(
                      `SELECT IFNULL(SUM(ep_type.ext_type_value), 0) AS total_extra_points
                      FROM extra_points ep
                      JOIN extra_points_type ep_type ON ep.ext_type_id = ep_type.ext_type_id
                      WHERE ep.ext_student_id = ?`,
                      [userId],
                      (err, totalPointsResult, fields) => {
                        if (err) {
                          console.error(err);
                          return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
                        } else {
                          const totalExtraPoints = totalPointsResult[0].total_extra_points;
                          res.json({ message: "Extra points updated successfully :) (ExtraPoints)", total_extra_points: totalExtraPoints });
                        }
                      }
                    );
                  }
                }
              );
            }
          );
        }
      );
    }
  );
});

/* DELETE the information of the extrapoints in the database */
extrapointsHub.delete("/:studentId/extra-points/:extraPointsId", (req, res) => {
  const studentId = req.params.studentId;
  const extraPointsId = req.params.extraPointsId;

  // First, check if the student exists in the database
  connection.query(
    'SELECT * FROM students WHERE student_id = ?',
    [studentId],
    (err, studentResult, fields) => {
      if (err) {
        console.error(err);
        return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
      }

      if (studentResult.length === 0) {
        return res.status(404).send("Student not found");
      }

      // Student exists, now get the user_id of the student
      const userId = studentResult[0].student_user_id;

      // Check if the extra points exist in the database
      connection.query(
        'SELECT * FROM extra_points WHERE ext_id = ?',
        [extraPointsId],
        (err, extraPointsResult, fields) => {
          if (err) {
            console.error(err);
            return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
          }

          if (extraPointsResult.length === 0) {
            return res.status(404).send("Extra points not found");
          }

          // Extra points exist, now get the ext_type_value of the extra points
          const extTypeValue = extraPointsResult[0].ext_type_value;

          // Calculate the updated total_extra_points
          connection.query(
            `SELECT IFNULL(SUM(ep_type.ext_type_value), 0) AS total_extra_points
            FROM extra_points ep
            JOIN extra_points_type ep_type ON ep.ext_type_id = ep_type.ext_type_id
            WHERE ep.ext_student_id = ?`,
            [studentId],
            (err, totalPointsResult, fields) => {
              if (err) {
                console.error(err);
                return res.status(500).send("¡ERROR! Error Fetching Data from the DataBase");
              } else {
                const currentTotalExtraPoints = totalPointsResult[0].total_extra_points;
                const updatedTotalExtraPoints = currentTotalExtraPoints - extTypeValue;

                // Update the total_extra_points for the student in the users table
                connection.query(
                  'UPDATE users SET total_extra_points = ? WHERE user_id = ?',
                  [updatedTotalExtraPoints, userId],
                  (err, updateResult, fields) => {
                    if (err) {
                      console.error(err);
                      return res.status(500).send("¡ERROR! Error Updating Data in the DataBase");
                    } else {
                      // Delete the extra points from the "extra_points" table
                      connection.query(
                        'DELETE FROM extra_points WHERE ext_id = ?',
                        [extraPointsId],
                        (err, deleteResult, fields) => {
                          if (err) {
                            console.error(err);
                            return res.status(500).send("¡ERROR! Error Deleting Data from the DataBase");
                          } else {
                            res.json({ message: "Extra points deleted successfully :) (ExtraPoints)", total_extra_points: updatedTotalExtraPoints });
                          }
                        }
                      );
                    }
                  }
                );
              }
            }
          );
        }
      );
    }
  );
});

export default extrapointsHub;
